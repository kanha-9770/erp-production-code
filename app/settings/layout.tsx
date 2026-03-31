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
    console.log("[settings-layout] no auth-token → /login");
    redirect("/login");
  }

  const session = await validateSession(token);

  if (!session) {
    console.log("[settings-layout] invalid session → /login");
    redirect("/login");
  }

  // Get current pathname from headers (set by middleware)
  const headersList = headers();
  const pathname =
    headersList.get("x-next-pathname") ||
    headersList.get("x-invoke-path") ||
    "/settings";

  console.log(
    `[settings-layout] user=${session.user.email} path=${pathname} checking permission...`
  );

  // Check route-level permissions (authoritative DB-backed check)
  const { allowed, isAdmin } = await checkRoutePermission(session.user.id, pathname);

  console.log(
    `[settings-layout] user=${session.user.email} path=${pathname} allowed=${allowed} isAdmin=${isAdmin}`
  );

  if (!allowed) {
    console.warn(
      `[settings-layout] DENIED user=${session.user.email} path=${pathname} isAdmin=${isAdmin} → /unauthorized`
    );
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
