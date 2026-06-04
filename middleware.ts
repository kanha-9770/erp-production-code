import { NextRequest, NextResponse } from "next/server";
import { patternToRegex, resolveRouteAccess } from "@/lib/route-permissions";
import { isPathBlockedByModules } from "@/lib/erp-modules";
import { verifyAuthMeta } from "@/lib/auth/auth-meta-cookie";
import { buildRedirectUrl } from "@/lib/request-url";

/**
 * Detect if a path segment looks like a Prisma CUID (module ID).
 */
const CUID_REGEX = /^c[a-z0-9]{15,}$/;

/**
 * Max age (ms) for the auth-meta cookie before middleware forces a refresh.
 * The client-side RoutePermissionGuard refreshes every 2 minutes,
 * so this is a safety net for when the client-side guard hasn't run yet.
 */
const AUTH_META_MAX_AGE = 5 * 60 * 1000; // 5 minutes

/**
 * One-shot URL marker appended to the refresh-meta callback. It rides in the
 * URL — NOT a cookie — on purpose: if the root cause is a cookie that never
 * makes it back to the server (e.g. a Secure cookie + an `http`
 * X-Forwarded-Proto from the proxy), a cookie-based guard would itself be lost
 * and the loop would continue. A query param always survives the round-trip,
 * so the middleware can reliably detect "I already sent you to refresh-meta
 * once and the cookie STILL isn't usable" and stop instead of looping into
 * ERR_TOO_MANY_REDIRECTS.
 */
const REFRESH_MARKER = "__authRefreshed";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Always allow internals, API, static files, /form/ pages ─────────────
  // `/models/` holds face-api.js weight shards (e.g. face_recognition_model-shard1)
  // which are EXTENSIONLESS files served from /public. Without this explicit
  // bypass they'd hit the auth-meta staleness redirect (line 94 below) every
  // 5 minutes and the browser would surface ERR_TOO_MANY_REDIRECTS — silently
  // breaking face verification + liveness in the attendance widget.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/form/") ||
    pathname.startsWith("/apply/") ||
    pathname.startsWith("/models/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── 2. Public routes ───────────────────────────────────────────────────────
  const publicRoutes = [
    "/login",
    "/register",
    "/signup",
    "/verify-otp",
    "/forgot-password",
    "/reset-password",
    "/auth/reset-password",
    "/unauthorized",
  ];

  // /real-estate/join/<token> must be public so an unauthenticated visitor
  // who pastes a shared invite URL can be redirected by the page itself to
  // /register?ref=<token>. If we left this gated by auth, the middleware
  // would bounce them to /login and the referral context would be lost.
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/real-estate/join/");

  // ── 3. Read auth token ─────────────────────────────────────────────────────
  const token = request.cookies.get("auth-token")?.value;

  // Logged-in users should NOT see login/register pages
  if (token && isPublicRoute && ["/login", "/register", "/signup"].includes(pathname)) {
    return NextResponse.redirect(buildRedirectUrl(request, "/"));
  }

  // Allow public routes for everyone
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Not logged in → redirect to login
  if (!token) {
    const loginUrl = buildRedirectUrl(request, "/login");
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 4. Read auth-meta cookie (HMAC-signed; tampering → null) ──────────────
  // verifyAuthMeta returns null for: missing cookie, malformed envelope, bad
  // signature, or non-object payload. In every case the answer is the same —
  // bounce through /api/auth/refresh-meta to mint a fresh signed cookie.
  const authMetaRaw = request.cookies.get("auth-meta")?.value;
  const authMeta = await verifyAuthMeta(authMetaRaw);

  // The cookie needs to be (re)minted when it's missing/tampered (null),
  // issued by an older code version (v < 2), or older than the staleness
  // window. All three resolve the same way: bounce through refresh-meta once.
  const needsRefresh =
    !authMeta ||
    !authMeta.v ||
    authMeta.v < 2 ||
    (!!authMeta.ts && Date.now() - authMeta.ts > AUTH_META_MAX_AGE);

  if (needsRefresh) {
    // ── Loop-breaker ────────────────────────────────────────────────────────
    // If we ALREADY bounced this request through refresh-meta (marker present)
    // and the cookie is STILL unusable, do NOT redirect again — that is exactly
    // what produces ERR_TOO_MANY_REDIRECTS. Let the request through: the user
    // still holds a valid `auth-token` (checked above), and the page-level
    // RoutePermissionGuard + server-side API checks (userHasRouteAccess) remain
    // in force, so this degrades gracefully instead of locking the app.
    if (request.nextUrl.searchParams.has(REFRESH_MARKER)) {
      console.warn(
        `[middleware] auth-meta still unusable after refresh for "${pathname}" — ` +
          `allowing through (auth-token + client guard still enforce access). ` +
          `Likely cause: the Secure auth-meta cookie isn't returning to the server — ` +
          `check that the proxy sends X-Forwarded-Proto: https.`
      );
      const response = NextResponse.next();
      response.headers.set("x-next-pathname", pathname);
      return response;
    }

    const refreshUrl = buildRedirectUrl(request, "/api/auth/refresh-meta");
    // Round-trip the marker via callbackUrl so a still-broken cookie can't loop.
    refreshUrl.searchParams.set("callbackUrl", `${pathname}?${REFRESH_MARKER}=1`);
    return NextResponse.redirect(refreshUrl);
  }

  // Cookie is valid & fresh. If the one-shot refresh marker is still on the URL
  // (we just came back from a successful refresh), strip it with a single clean
  // redirect. The cookie is good now, so the next pass sails straight through —
  // one redirect, never a loop.
  if (request.nextUrl.searchParams.has(REFRESH_MARKER)) {
    return NextResponse.redirect(buildRedirectUrl(request, pathname));
  }

  // ── 4c. ERP module gate ───────────────────────────────────────────────────
  // Block requests to URL prefixes owned by modules the org has NOT opted
  // into. Admins are subject to this gate too — the only way to access a
  // disabled module's pages is to re-enable it in Settings → Modules.
  // `selectedModules` is undefined on cookies issued before this feature
  // shipped; in that case we skip gating so legacy sessions still work.
  if (Array.isArray(authMeta.selectedModules)) {
    if (isPathBlockedByModules(pathname, authMeta.selectedModules)) {
      const url = buildRedirectUrl(request, "/");
      url.searchParams.set("moduleDisabled", "1");
      return NextResponse.redirect(url);
    }
  }

  // ── 5. Admin bypasses everything ───────────────────────────────────────────
  if (authMeta.isAdmin) {
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return response;
  }

  // ── 5b. MLM-only agents land on /real-estate ───────────────────────────────
  // A user whose only role is the auto-provisioned "Real Estate Agent" has
  // zero allowedRoutes outside `/real-estate*` and `/profile*`. If they hit
  // the root (or any non-real-estate, non-profile page that *would* be
  // open-by-default per rule 8), bounce them to the real-estate hub so they
  // don't get a blank screen or a redirect loop through /unauthorized.
  const roleNames: string[] = Array.isArray(authMeta.roleNames) ? authMeta.roleNames : [];
  const isRebmOnly =
    roleNames.length > 0 && roleNames.every((n) => n === "Real Estate Agent");
  if (
    isRebmOnly &&
    (pathname === "/" || pathname === "")
  ) {
    return NextResponse.redirect(buildRedirectUrl(request, "/real-estate"));
  }

  // ── 6. Specificity-based route access check ───────────────────────────────
  // Uses resolveRouteAccess which picks the MOST SPECIFIC matching pattern.
  // A specific deny (e.g. /profile/update-profile) wins over a general allow
  // (e.g. /profile or /profile/**).
  const allowedRoutes: string[] = Array.isArray(authMeta.allowedRoutes)
    ? authMeta.allowedRoutes
    : [];
  const deniedRoutes: string[] = Array.isArray(authMeta.deniedRoutes)
    ? authMeta.deniedRoutes
    : [];

  const routeResult = resolveRouteAccess(pathname, allowedRoutes, deniedRoutes);

  if (routeResult === true) {
    // Explicitly allowed by the most specific matching pattern
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return response;
  }

  if (routeResult === false) {
    // Explicitly denied by the most specific matching pattern
    return NextResponse.redirect(buildRedirectUrl(request, "/unauthorized"));
  }

  // ── 7. Dynamic module routes (/[module_name]/[moduleId]/...) ─────────────
  // No DB rule matched — allow module routes (page-level VIEW check handles it)
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && CUID_REGEX.test(segments[1])) {
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return response;
  }

  // ── 8. Allow (no rule matched = open) ──────────────────────────────────────
  const response = NextResponse.next();
  response.headers.set("x-next-pathname", pathname);
  return response;
}

export const config = {
  // Matcher excludes paths the middleware function should never even be
  // invoked for. `models` is the face-api.js weight shard directory in
  // /public — extensionless files that would otherwise hit the auth-meta
  // staleness redirect every 5 minutes and produce ERR_TOO_MANY_REDIRECTS
  // in the browser. Belt-and-suspenders with the `pathname.startsWith("/models/")`
  // early-return inside the middleware function above.
  matcher: ["/((?!api|_next/static|_next/image|models|favicon\\.ico).*)"],
};
