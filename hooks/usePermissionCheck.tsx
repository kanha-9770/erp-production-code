import { usePermissions } from '@/lib/permission-context';

interface UsePermissionCheckReturn {
  isLoading: boolean;
  isAuthenticated: boolean;
  isSystemAdmin: boolean;
  hasModuleAccess: (moduleId: string) => boolean;
  hasFormAccess: (formId: string) => boolean;
  canPerformAction: (
    moduleId: string,
    action: 'view' | 'create' | 'edit' | 'delete',
    formId?: string
  ) => boolean;
  getAccessibleActions: (
    moduleId: string,
    formId?: string
  ) => {
    canView: boolean;
    canAdd: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
}

/**
 * Custom hook for permission checking in components
 * Provides a convenient API for checking permissions
 */
export const usePermissionCheck = (): UsePermissionCheckReturn => {
  const {
    user,
    isLoading,
    isSystemAdmin,
    hasModuleAccess,
    hasFormAccess,
    getAccessibleActions: getActions
  } = usePermissions();

  const canPerformAction = (
    moduleId: string,
    action: 'view' | 'create' | 'edit' | 'delete' ,
    formId?: string
  ): boolean => {
    if (!user) return false;
    if (isSystemAdmin) return true;

    const actions = getActions(moduleId, formId);
    
    switch (action) {
      case 'view':
        return actions.canView;
      case 'create':
        return actions.canAdd;
      case 'edit':
        return actions.canEdit;
      case 'delete':
        return actions.canDelete;
      default:
        return false;
    }
  };

  return {
    isLoading,
    isAuthenticated: !!user,
    isSystemAdmin,
    hasModuleAccess,
    hasFormAccess,
    canPerformAction,
    getAccessibleActions: getActions,
  };
};