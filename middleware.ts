import { NextRequest, NextResponse } from "next/server";
import { patternToRegex } from "@/lib/route-permissions";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes (no auth needed)
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

  // Always allow public routes, /auth prefixed pages, & Next internals
  if (
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/form/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Read auth token
  const token = request.cookies.get("auth-token")?.value;

  // Not logged in → redirect to login
  if (!token) {
    console.log(`[middleware] REDIRECT path=${pathname} reason="no auth-token" → /login`);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged-in users should NOT access auth pages
  if (
    pathname === "/login" || pathname === "/register" || pathname === "/signup"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Route permission check using auth-meta cookie
  // Only source of truth: DB route permissions (allowedRoutes / deniedRoutes)
  // computed at login and stored in the cookie. No hardcoded admin checks.
  const authMetaRaw = request.cookies.get("auth-meta")?.value;
  if (authMetaRaw) {
    try {
      const authMeta = JSON.parse(authMetaRaw);

      // Admin bypasses all route checks
      if (!authMeta.isAdmin) {
        const deniedRoutes: string[] = Array.isArray(authMeta.deniedRoutes) ? authMeta.deniedRoutes : [];

        for (const pattern of deniedRoutes) {
          if (patternToRegex(pattern).test(pathname)) {
            console.warn(
              `[middleware] DENIED path=${pathname} matchedPattern="${pattern}" roles=[${authMeta.roleNames}]`
            );
            return NextResponse.redirect(
              new URL("/unauthorized", request.url)
            );
          }
        }
      }
    } catch {
      console.warn(`[middleware] path=${pathname} invalid auth-meta cookie, skipping`);
    }
  }

  // Forward pathname to server components via header
  const response = NextResponse.next();
  response.headers.set("x-next-pathname", pathname);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico).*)"],
};