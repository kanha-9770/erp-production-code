import type { NextRequest } from "next/server";

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

function publicOriginFromEnv(): string | null {
  const raw =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the public origin a redirect should point at.
 *
 * Why: behind a reverse proxy (`next start -p 5001` upstream of nginx) the
 * incoming Host header — and therefore `request.url` and `request.nextUrl` —
 * can carry the private upstream address. Building redirect URLs from that
 * value 302s real users to `http://localhost:5001/...`. Order of trust:
 *   1. `x-forwarded-host` + `x-forwarded-proto` (any properly configured proxy)
 *   2. `request.nextUrl.origin` if its host is NOT private
 *   3. `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` env var
 *   4. As a last resort, the (possibly private) `request.nextUrl.origin`
 */
export function getRequestOrigin(request: NextRequest): string {
  // In development, the request origin (e.g. http://localhost:5001) IS the
  // public origin — there's no proxy, and falling back to NEXTAUTH_URL /
  // NEXT_PUBLIC_APP_URL would bounce redirects to the production site.
  if (process.env.NODE_ENV !== "production") {
    return request.nextUrl.origin;
  }

  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto");
  if (fwdHost && !PRIVATE_HOST.test(fwdHost)) {
    const proto = (fwdProto?.split(",")[0]?.trim()) || "https";
    return `${proto}://${fwdHost.split(",")[0]?.trim()}`;
  }

  const nextOrigin = request.nextUrl.origin;
  const nextHost = request.nextUrl.host;
  if (!PRIVATE_HOST.test(nextHost)) {
    return nextOrigin;
  }

  const envOrigin = publicOriginFromEnv();
  if (envOrigin) return envOrigin;

  return nextOrigin;
}

/**
 * Build an absolute redirect URL using the public origin (see getRequestOrigin).
 * Accepts a path ("/login") or a full URL (returned as-is if absolute).
 */
export function buildRedirectUrl(request: NextRequest, target: string): URL {
  if (/^https?:\/\//i.test(target)) return new URL(target);
  return new URL(target, getRequestOrigin(request));
}
