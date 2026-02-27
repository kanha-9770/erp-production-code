import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: {
    resourceType: "module" | "form";
    resourceId: string;
    action: "view" | "create" | "edit" | "delete";
    moduleId?: string; // Required for form permissions
  };
  fallback?: React.ReactNode;
  requireAuth?: boolean;
}

interface UserPermission {
  resourceType: "module" | "form";
  resourceId: string;
  permissions: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
  isSystemAdmin: boolean;
  resource?: {
    id: string;
    name: string;
    description?: string;
    moduleId?: string;
  };
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: UserPermission[];
}

export function ProtectedRoute({
  children,
  requiredPermission,
  fallback,
  requireAuth = true,
}: ProtectedRouteProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user credentials from localStorage (in production, use secure storage)
      const userId = localStorage.getItem("auth_user_id");
      const userEmail = localStorage.getItem("auth_user_email");

      if (!userId || !userEmail) {
        if (requireAuth) {
          setError("Authentication required");
          return;
        } else {
          setLoading(false);
          return;
        }
      }

      // Fetch user permissions
      const response = await fetch("/api/users/permissions", {
        headers: {
          "x-user-id": userId,
          "x-user-email": userEmail,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch user permissions");
      }

      setUser(data.user);
    } catch (error: any) {
      console.error("Auth check failed:", error);
      setError(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (
    user: AuthUser,
    permission: ProtectedRouteProps["requiredPermission"]
  ): boolean => {
    if (!permission) return true;

    // Check for system admin
    const hasSystemAdmin = user.permissions.some((p) => p.isSystemAdmin);
    if (hasSystemAdmin) return true;

    if (permission.resourceType === "module") {
      // Check module permission
      const modulePermission = user.permissions.find(
        (p) =>
          p.resourceType === "module" && p.resourceId === permission.resourceId
      );

      if (modulePermission) {
        switch (permission.action) {
          case "view":
            return modulePermission.permissions.canView;
          case "create":
            return modulePermission.permissions.canCreate;
          case "edit":
            return modulePermission.permissions.canEdit;
          case "delete":
            return modulePermission.permissions.canDelete;
          default:
            return false;
        }
      }
    } else if (permission.resourceType === "form" && permission.moduleId) {
      // Check if user has module manage permission (grants all form permissions)
      const modulePermission = user.permissions.find(
        (p) =>
          p.resourceType === "module" && p.resourceId === permission.moduleId
      );

      // Check specific form permission
      const formPermission = user.permissions.find(
        (p) =>
          p.resourceType === "form" && p.resourceId === permission.resourceId
      );

      if (formPermission) {
        switch (permission.action) {
          case "view":
            return formPermission.permissions.canView;
          case "create":
            return formPermission.permissions.canCreate;
          case "edit":
            return formPermission.permissions.canEdit;
          case "delete":
            return formPermission.permissions.canDelete;
          default:
            return false;
        }
      }
    }

    return false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-600">Authentication Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push("/login")} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requireAuth && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 text-gray-500 mx-auto mb-4" />
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to access this page</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push("/login")} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user && requiredPermission && !hasPermission(user, requiredPermission)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-600">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this resource.
              <br />
              Required: {requiredPermission.action} access to{" "}
              {requiredPermission.resourceType} {requiredPermission.resourceId}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button
              onClick={() => router.back()}
              variant="outline"
              className="w-full"
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
