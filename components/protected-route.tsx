import React from 'react';
import { usePermissions } from '@/lib/permission-context';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  moduleId?: string;
  formId?: string;
  requiredAction?: 'view' | 'create' | 'edit' | 'delete';
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  moduleId: propModuleId,
  formId: propFormId,
  requiredAction = 'view',
  redirectTo = '/',
}) => {
  const {
    user,
    isLoading,
    isSystemAdmin,
    hasModuleAccess,
    hasFormAccess,
    getAccessibleActions
  } = usePermissions();

  // Extract IDs from URL if not provided as props
  const getIdsFromUrl = () => {
    if (typeof window === 'undefined') return { moduleId: propModuleId, formId: propFormId };
    
    const url = new URL(window.location.href);
    const pathname = url.pathname;
    const searchParams = url.searchParams;
    
    // Extract moduleId from URL path (e.g., /admin/users -> users)
    const pathParts = pathname.split('/').filter(Boolean);
    const urlModuleId = pathParts[pathParts.length - 1]; // Get last part of path
    
    // Extract formId from URL parameters (e.g., ?id=cmd2xzq4s0009u1t80inazpgt)
    const urlFormId = searchParams.get('id');
    
    return {
      moduleId: propModuleId || urlModuleId,
      formId: propFormId || urlFormId
    };
  };

  const { moduleId, formId } = getIdsFromUrl();

  // Show loading state while permissions are being fetched
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if user is not authenticated
  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.href = redirectTo;
    }
    return null;
  }

  // System admin has access to everything
  if (isSystemAdmin) {
    return <>{children}</>;
  }

  // Check permissions based on whether we have moduleId and/or formId
  let hasAccess = false;
  
  if (!moduleId) {
    // No moduleId found, deny access
    hasAccess = false;
  } else if (formId) {
    // Check form access
    hasAccess = hasFormAccess(formId);
    
    // If we need specific action permission, check that too
    if (hasAccess && requiredAction !== 'view') {
      const actions = getAccessibleActions(moduleId, formId);
      switch (requiredAction) {
        case 'create':
          hasAccess = actions.canAdd;
          break;
        case 'edit':
          hasAccess = actions.canEdit;
          break;
        case 'delete':
          hasAccess = actions.canDelete;
          break;
      }
    }
  } else {
    // Check module access
    hasAccess = hasModuleAccess(moduleId);
    
    // If we need specific action permission, check that too
    if (hasAccess && requiredAction !== 'view') {
      const actions = getAccessibleActions(moduleId);
      switch (requiredAction) {
        case 'create':
          hasAccess = actions.canAdd;
          break;
        case 'edit':
          hasAccess = actions.canEdit;
          break;
        case 'delete':
          hasAccess = actions.canDelete;
          break;
      }
    }
  }

  // If user doesn't have access, redirect
  if (!hasAccess) {
    if (typeof window !== 'undefined') {
      console.log(`[ProtectedRoute] Access denied for moduleId: ${moduleId}, formId: ${formId}, action: ${requiredAction}`);
      window.location.href = redirectTo;
    }
    return null;
  }

  // User has access, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;