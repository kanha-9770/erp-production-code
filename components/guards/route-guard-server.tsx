import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth";
import { checkRoutePermission } from "@/lib/check-route-permission";

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-otp",
  "/auth",
  "/unauthorized",
  "/unautherized",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
}

/**
 * Server component that enforces DB-backed route permissions
 * for every non-public page. Wrap this around {children} in the root layout.
 *
 * Policy: default DENY — non-admin users need explicit access grants.
 */
export async function RouteGuardServer({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = headers();
  const pathname =
    headersList.get("x-next-pathname") ||
    headersList.get("x-invoke-path") ||
    "/";

  // Skip checks for public routes, API, static assets, form pages
  if (
    isPublicRoute(pathname) ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/form/") ||
    pathname.includes(".")
  ) {
    return <>{children}</>;
  }

  // Check auth
  const cookieStore = cookies();
  const token = cookieStore.get("auth-token")?.value;

  if (!token) {
    redirect("/login");
  }

  const session = await validateSession(token);
  if (!session) {
    redirect("/login");
  }

  // Check route permission (default-deny for non-admin)
  const { allowed } = await checkRoutePermission(session.user.id, pathname);

  if (!allowed) {
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
