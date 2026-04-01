import { NextRequest, NextResponse } from "next/server";
import { patternToRegex } from "@/lib/route-permissions";

/**
 * Detect if a path segment looks like a Prisma CUID (module ID).
 */
const CUID_REGEX = /^c[a-z0-9]{15,}$/;

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

  const isPublicRoute =
    publicRoutes.includes(pathname) || pathname.startsWith("/auth");

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
    console.log(`[MW] step=4 path=${pathname} NO auth-meta cookie → redirecting to refresh`);
    const refreshUrl = new URL("/api/auth/refresh-meta", request.url);
    refreshUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(refreshUrl);
  }

  let authMeta: {
    v?: number;
    isAdmin?: boolean;
    roleNames?: string[];
    deniedRoutes?: string[];
    allowedRoutes?: string[];
    allowedModuleIds?: string[];
  };

  try {
    authMeta = JSON.parse(authMetaRaw);
  } catch {
    console.log(`[MW] step=4 path=${pathname} INVALID auth-meta cookie → redirecting to refresh`);
    const refreshUrl = new URL("/api/auth/refresh-meta", request.url);
    refreshUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(refreshUrl);
  }

  // Force refresh if cookie is from an older version (missing v field)
  if (!authMeta.v || authMeta.v < 2) {
    console.log(`[MW] step=4 path=${pathname} STALE auth-meta (v=${authMeta.v ?? 0}) → refreshing`);
    const refreshUrl = new URL("/api/auth/refresh-meta", request.url);
    refreshUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(refreshUrl);
  }

  console.log(
    `[MW] step=5 path=${pathname} isAdmin=${authMeta.isAdmin} roles=[${authMeta.roleNames}] deniedCount=${authMeta.deniedRoutes?.length ?? 0} allowedCount=${authMeta.allowedRoutes?.length ?? 0} moduleCount=${authMeta.allowedModuleIds?.length ?? 0}`
  );

  // ── 5. Admin bypasses everything ───────────────────────────────────────────
  if (authMeta.isAdmin) {
    console.log(`[MW] step=5 path=${pathname} ADMIN → ALLOWED`);
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return response;
  }

  // ── 6. Check static route denials (from RoutePermission table) ─────────────
  const deniedRoutes: string[] = Array.isArray(authMeta.deniedRoutes)
    ? authMeta.deniedRoutes
    : [];
  const allowedRoutes: string[] = Array.isArray(authMeta.allowedRoutes)
    ? authMeta.allowedRoutes
    : [];

  // First check if route is explicitly allowed (takes priority)
  for (const pattern of allowedRoutes) {
    if (patternToRegex(pattern).test(pathname)) {
      console.log(`[MW] step=6 path=${pathname} ALLOWED by allowedRoutes pattern="${pattern}"`);
      const response = NextResponse.next();
      response.headers.set("x-next-pathname", pathname);
      return response;
    }
  }

  // Then check if route is denied
  for (const pattern of deniedRoutes) {
    if (patternToRegex(pattern).test(pathname)) {
      console.log(
        `[MW] step=6 path=${pathname} DENIED by deniedRoutes pattern="${pattern}" roles=[${authMeta.roleNames}]`
      );
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  }

  // ── 7. Dynamic module routes (/[module_name]/[moduleId]/...) ─────────────
  // Always allowed at middleware level — module access is enforced
  // client-side by the page's VIEW permission check via usePermissionContext().
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && CUID_REGEX.test(segments[1])) {
    console.log(`[MW] step=7 path=${pathname} moduleRoute=true → ALLOWED (checked client-side)`);
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return response;
  }

  // ── 8. Allow (no rule matched = open) ──────────────────────────────────────
  console.log(`[MW] step=8 path=${pathname} ALLOWED (no deny rule matched)`);
  const response = NextResponse.next();
  response.headers.set("x-next-pathname", pathname);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico).*)"],
};
