import { validateSession } from "@/lib/auth";
import { checkRoutePermission } from "@/lib/check-route-permission";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get("auth-token")?.value;

  if (!token) {
    redirect("/login");
  }

  const session = await validateSession(token);

  if (!session) {
    redirect("/login");
  }

  // Get current pathname from headers (set by Next.js middleware)
  const headersList = headers();
  const pathname =
    headersList.get("x-next-pathname") ||
    headersList.get("x-invoke-path") ||
    "/settings";

  // Check route-level permissions (authoritative DB-backed check)
  const { allowed, isAdmin } = await checkRoutePermission(session.user.id, pathname);

  if (!allowed) {
    console.warn(
      `[settings-layout] DENIED user=${session.user.email} path=${pathname} isAdmin=${isAdmin}`
    );
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
