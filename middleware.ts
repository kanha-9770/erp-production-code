import { NextRequest, NextResponse } from "next/server";
import { patternToRegex, resolveRouteAccess } from "@/lib/route-permissions";

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Always allow internals, API, static files, /form/ pages ─────────────
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/form/") ||
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
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Allow public routes for everyone
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Not logged in → redirect to login
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 4. Read auth-meta cookie ───────────────────────────────────────────────
  const authMetaRaw = request.cookies.get("auth-meta")?.value;

  if (!authMetaRaw) {
    const refreshUrl = new URL("/api/auth/refresh-meta", request.url);
    refreshUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(refreshUrl);
  }

  let authMeta: {
    v?: number;
    ts?: number;
    isAdmin?: boolean;
    roleNames?: string[];
    deniedRoutes?: string[];
    allowedRoutes?: string[];
    allowedModuleIds?: string[];
  };

  try {
    authMeta = JSON.parse(authMetaRaw);
  } catch {
    const refreshUrl = new URL("/api/auth/refresh-meta", request.url);
    refreshUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(refreshUrl);
  }

  // Force refresh if cookie is from an older version (missing v or ts field)
  if (!authMeta.v || authMeta.v < 2) {
    const refreshUrl = new URL("/api/auth/refresh-meta", request.url);
    refreshUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(refreshUrl);
  }

  // ── 4b. Staleness check — force refresh if cookie is too old ──────────────
  if (authMeta.ts && Date.now() - authMeta.ts > AUTH_META_MAX_AGE) {
    console.log(
      `[MW] path=${pathname} auth-meta STALE (age=${Math.round((Date.now() - authMeta.ts) / 1000)}s) → refreshing`
    );
    const refreshUrl = new URL("/api/auth/refresh-meta", request.url);
    refreshUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(refreshUrl);
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
    return NextResponse.redirect(new URL("/real-estate", request.url));
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
    console.log(
      `[MW] path=${pathname} DENIED (specificity match) roles=[${authMeta.roleNames}]`
    );
    return NextResponse.redirect(new URL("/unauthorized", request.url));
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
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico).*)"],
};
