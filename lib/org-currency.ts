"use client";

import { useEffect, useState } from "react";

/**
 * Centralised access to the organisation's currency setting.
 *
 * The server is the source of truth: `Organization.currency` in the DB,
 * exposed via `/api/organization/settings` (GET = any member, PUT =
 * admin only). LocalStorage acts as a fast-read cache so synchronous
 * `formatCurrency()` calls in render paths don't have to await a fetch.
 *
 * Anywhere monetary amounts are displayed should call:
 *
 *   import { useOrgCurrency, formatCurrency } from "@/lib/org-currency";
 *   const currency = useOrgCurrency();
 *   formatCurrency(amount);          // uses the saved currency
 *   formatCurrency(amount, "EUR");   // override per-call if needed
 *
 * The hook subscribes to a same-tab CustomEvent and the cross-tab
 * `storage` event so the UI re-renders when the admin updates the
 * value. It also kicks a one-time fetch on first mount per session so
 * non-admin users (who never open the Organization tab) still get the
 * server value without a round-trip on every consuming component.
 */

const STORAGE_KEY = "org.settings.v1";
const EVENT_NAME = "orgcurrency:changed";
const DEFAULT_CURRENCY = "USD";

interface OrgSettings {
  currency?: string;
}

// Module-level guard: once the first `useOrgCurrency()` mounts, we kick
// a single fetch from the server and cache the result. Subsequent
// mounts read from localStorage. This lets every page that displays
// money pick up the org's chosen currency without each one issuing its
// own request.
let serverFetchPromise: Promise<string> | null = null;

export interface CurrencyOption {
  code: string;   // ISO 4217
  symbol: string; // common display symbol
  name: string;   // English label
}

// Curated list of widely-used currencies. Ordered roughly by global
// trading volume. Add more here as needed — `formatCurrency` falls back
// to the ISO code as the symbol if a currency isn't in this list, so
// admins typing in any valid 3-letter code still gets sensible output.
export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", symbol: "$",   name: "US Dollar" },
  { code: "EUR", symbol: "€",   name: "Euro" },
  { code: "GBP", symbol: "£",   name: "British Pound" },
  { code: "INR", symbol: "₹",   name: "Indian Rupee" },
  { code: "JPY", symbol: "¥",   name: "Japanese Yen" },
  { code: "CNY", symbol: "¥",   name: "Chinese Yuan" },
  { code: "AUD", symbol: "A$",  name: "Australian Dollar" },
  { code: "CAD", symbol: "C$",  name: "Canadian Dollar" },
  { code: "CHF", symbol: "Fr.", name: "Swiss Franc" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SAR", symbol: "﷼",   name: "Saudi Riyal" },
  { code: "SGD", symbol: "S$",  name: "Singapore Dollar" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "KRW", symbol: "₩",   name: "South Korean Won" },
  { code: "THB", symbol: "฿",   name: "Thai Baht" },
  { code: "IDR", symbol: "Rp",  name: "Indonesian Rupiah" },
  { code: "MYR", symbol: "RM",  name: "Malaysian Ringgit" },
  { code: "PHP", symbol: "₱",   name: "Philippine Peso" },
  { code: "VND", symbol: "₫",   name: "Vietnamese Dong" },
  { code: "PKR", symbol: "₨",   name: "Pakistani Rupee" },
  { code: "BDT", symbol: "৳",   name: "Bangladeshi Taka" },
  { code: "LKR", symbol: "Rs",  name: "Sri Lankan Rupee" },
  { code: "NPR", symbol: "रू",  name: "Nepalese Rupee" },
  { code: "TRY", symbol: "₺",   name: "Turkish Lira" },
  { code: "RUB", symbol: "₽",   name: "Russian Ruble" },
  { code: "ZAR", symbol: "R",   name: "South African Rand" },
  { code: "EGP", symbol: "E£",  name: "Egyptian Pound" },
  { code: "NGN", symbol: "₦",   name: "Nigerian Naira" },
  { code: "BRL", symbol: "R$",  name: "Brazilian Real" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso" },
  { code: "ARS", symbol: "$",   name: "Argentine Peso" },
  { code: "CLP", symbol: "CL$", name: "Chilean Peso" },
  { code: "PEN", symbol: "S/.", name: "Peruvian Sol" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
];

export function findCurrency(code: string): CurrencyOption | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

/** Read the saved currency synchronously. SSR-safe. */
export function getOrgCurrency(): string {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CURRENCY;
    const parsed = JSON.parse(raw) as OrgSettings;
    if (typeof parsed?.currency === "string" && parsed.currency.length === 3) {
      return parsed.currency.toUpperCase();
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CURRENCY;
}

/** Write to the localStorage cache only. Does not call the server. */
function writeCache(code: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as OrgSettings) : {};
    parsed.currency = code.toUpperCase();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

/**
 * Persist a new currency to the server, update the local cache and
 * broadcast the change so every subscribed component re-renders.
 * Throws if the server rejects the request — admins can surface that
 * error in their Save handler.
 */
export async function setOrgCurrency(code: string): Promise<string> {
  const upper = code.toUpperCase();
  const res = await fetch("/api/organization/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currency: upper }),
  });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; settings?: { currency?: string }; error?: string }
    | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error ?? `Failed to save currency (${res.status})`);
  }
  const saved = json.settings?.currency ?? upper;
  writeCache(saved);
  notifyCurrencyChanged(saved);
  return saved;
}

/**
 * Pull the server's current value, update the cache and notify
 * subscribers. Memoised at module level so concurrent calls collapse
 * into a single network request — useful when many components mount
 * `useOrgCurrency()` at once on first page load.
 */
export function fetchOrgCurrency(): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve(DEFAULT_CURRENCY);
  if (serverFetchPromise) return serverFetchPromise;
  serverFetchPromise = (async () => {
    try {
      const res = await fetch("/api/organization/settings", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return getOrgCurrency();
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; settings?: { currency?: string } }
        | null;
      const code = json?.settings?.currency;
      if (code && /^[A-Z]{3}$/.test(code)) {
        // Only broadcast if the server's value differs from the cache
        // so we don't trigger a no-op re-render storm across the app.
        if (code !== getOrgCurrency()) {
          writeCache(code);
          notifyCurrencyChanged(code);
        }
        return code;
      }
      return getOrgCurrency();
    } catch {
      return getOrgCurrency();
    } finally {
      // Allow a fresh fetch later (e.g. user navigates back to Profile
      // and Save was called from another tab). Reset after the request
      // settles so concurrent callers in the same tick still share it.
      setTimeout(() => {
        serverFetchPromise = null;
      }, 0);
    }
  })();
  return serverFetchPromise;
}

/** Manually fire the change event (e.g. after a server-side update). */
export function notifyCurrencyChanged(code: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { currency: code } }),
  );
}

// Tracks whether we've already pulled from the server in this session.
// First mount triggers a fetch; subsequent mounts read from cache.
let hasFetchedThisSession = false;

/**
 * React hook. Returns the current currency code and re-renders the
 * calling component whenever it changes. Use anywhere monetary amounts
 * are displayed.
 *
 * On its first invocation in the page session it kicks a server fetch
 * so even non-admin users — who never open the Organization tab —
 * pick up the org's chosen currency from the DB instead of the
 * localStorage default.
 */
export function useOrgCurrency(): string {
  const [code, setCode] = useState<string>(() =>
    typeof window === "undefined" ? DEFAULT_CURRENCY : getOrgCurrency(),
  );
  useEffect(() => {
    const update = () => setCode(getOrgCurrency());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) update();
    };
    window.addEventListener(EVENT_NAME, update);
    window.addEventListener("storage", onStorage);
    if (!hasFetchedThisSession) {
      hasFetchedThisSession = true;
      // Fire-and-forget — fetchOrgCurrency dispatches the change event
      // when the server's value differs from cache, which triggers our
      // listener above and drives the re-render.
      void fetchOrgCurrency();
    }
    return () => {
      window.removeEventListener(EVENT_NAME, update);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return code;
}

/**
 * Format a number as currency in the org's chosen code. Falls back to
 * the ISO code as the symbol if the runtime can't resolve it.
 */
export function formatCurrency(
  amount: number | null | undefined,
  override?: string,
): string {
  const code = (override || getOrgCurrency()).toUpperCase();
  if (amount == null || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const sym = findCurrency(code)?.symbol ?? code;
    return `${sym} ${amount.toFixed(2)}`;
  }
}
