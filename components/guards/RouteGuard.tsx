"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissionContext } from "@/context/PermissionContext";
import { Loader2 } from "lucide-react";

interface RouteGuardProps {
  /** If true, only admin users can access */
  requireAdmin?: boolean;
  /** Permission name(s) — user needs at least one */
  requiredPermissions?: string[];
  /** Optional module scope for permission check */
  moduleId?: string;
  /** Optional form scope for permission check */
  formId?: string;
  /** Custom fallback while loading (defaults to spinner) */
  loadingFallback?: React.ReactNode;
  /** Redirect path on denial (defaults to "/unauthorized") */
  redirectTo?: string;
  children: React.ReactNode;
}

export function RouteGuard({
  requireAdmin,
  requiredPermissions,
  moduleId,
  formId,
  loadingFallback,
  redirectTo = "/unauthorized",
  children,
}: RouteGuardProps) {
  const router = useRouter();
  const { hasAnyPermission, isLoading, permissions, user } =
    usePermissionContext();

  // Determine admin status from user's role assignments
  const isAdmin =
    (user as any)?.unitAssignments?.some(
      (ua: any) =>
        ua.role?.isAdmin || ua.role?.name?.toUpperCase() === "ADMIN"
    ) ?? false;

  const isAllowed = (() => {
    if (isLoading) return null; // still loading
    if (isAdmin) return true;
    if (requireAdmin) return false;
    if (requiredPermissions && requiredPermissions.length > 0) {
      return hasAnyPermission(requiredPermissions, moduleId, formId);
    }
    return true; // no requirements specified
  })();

  useEffect(() => {
    if (isAllowed === false) {
      router.replace(redirectTo);
    }
  }, [isAllowed, router, redirectTo]);

  // Loading state
  if (isAllowed === null) {
    return (
      loadingFallback ?? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )
    );
  }

  // Denied — redirect is in progress
  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
