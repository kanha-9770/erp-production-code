// /**
//  * Analytics dashboard constants and configurations
//  */

// export const CHART_COLORS = {
//   primary: '#3b82f6', // Blue
//   success: '#10b981', // Emerald
//   warning: '#f59e0b', // Amber
//   danger: '#ef4444', // Red
//   accent: '#8b5cf6', // Purple
//   info: '#06b6d4', // Cyan
//   secondary: '#ec4899', // Pink
//   tertiary: '#14b8a6', // Teal
// } as const;

// export const ACTION_TYPE_COLORS: Record<string, string> = {
//   CREATE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
//   UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
//   DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
//   READ: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
//   LOGIN: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
//   LOGOUT: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
// } as const;

// export const USER_STATUS_COLORS: Record<string, string> = {
//   ACTIVE: '#10b981', // Emerald
//   INACTIVE: '#6b7280', // Gray
//   SUSPENDED: '#ef4444', // Red
//   PENDING: '#f59e0b', // Amber
//   PENDING_VERIFICATION: '#8b5cf6', // Purple
// } as const;

// export const GRADIENT_COLORS = {
//   blue: 'from-blue-600 to-blue-700',
//   emerald: 'from-emerald-600 to-emerald-700',
//   purple: 'from-purple-600 to-purple-700',
//   amber: 'from-amber-600 to-amber-700',
//   cyan: 'from-cyan-600 to-cyan-700',
//   violet: 'from-violet-600 to-violet-700',
//   pink: 'from-pink-600 to-pink-700',
// } as const;

// export const TIME_RANGE_OPTIONS = [
//   { label: 'Today', value: 'today' },
//   { label: 'Last 7 days', value: '7days' },
//   { label: 'Last 30 days', value: '30days' },
//   { label: 'Last 90 days', value: '90days' },
//   { label: 'This Quarter', value: 'quarter' },
//   { label: 'This Year', value: 'year' },
// ] as const;

// export const DATA_RETENTION_OPTIONS = [
//   { label: '30 Days', value: '30' },
//   { label: '60 Days', value: '60' },
//   { label: '90 Days', value: '90' },
//   { label: '180 Days', value: '180' },
//   { label: '365 Days', value: '365' },
// ] as const;

// export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;

// export const FORM_MODULE_COUNT = 15;

// export const AUDIT_LOG_PAGE_SIZE = 10;
// export const USER_ANALYTICS_LIMIT = 100;

// export const CHART_CONFIG = {
//   margin: { top: 10, right: 30, left: 0, bottom: 0 },
//   strokeDasharray: '3 3',
//   animationDuration: 300,
// } as const;

// export const DATE_FORMAT_OPTIONS = {
//   short: 'MMM d, yyyy',
//   long: 'MMMM d, yyyy h:mm a',
//   full: 'EEEE, MMMM d, yyyy',
// } as const;

// export const METRIC_UNITS = {
//   users: 'Users',
//   submissions: 'Submissions',
//   entries: 'Entries',
//   logins: 'Logins',
// } as const;

// /**
//  * Get display name for action type
//  */
// export function getActionDisplayName(action: string): string {
//   const displayMap: Record<string, string> = {
//     CREATE: 'Created',
//     UPDATE: 'Updated',
//     DELETE: 'Deleted',
//     READ: 'Viewed',
//     LOGIN: 'Logged In',
//     LOGOUT: 'Logged Out',
//   };
//   return displayMap[action.toUpperCase()] || action;
// }

// /**
//  * Format large numbers with abbreviations
//  */
// export function formatNumber(num: number): string {
//   if (num >= 1000000) {
//     return (num / 1000000).toFixed(1) + 'M';
//   }
//   if (num >= 1000) {
//     return (num / 1000).toFixed(1) + 'K';
//   }
//   return num.toString();
// }

// /**
//  * Calculate percentage change
//  */
// export function calculatePercentageChange(current: number, previous: number): {
//   change: number;
//   isIncrease: boolean;
// } {
//   if (previous === 0) return { change: 0, isIncrease: true };
//   const change = ((current - previous) / previous) * 100;
//   return {
//     change: Math.abs(change),
//     isIncrease: change >= 0,
//   };
// }

// /**
//  * Format date for display
//  */
// export function formatDateRange(startDate: string, endDate: string): string {
//   return `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
// }


/**
 * Analytics dashboard constants and configurations
 */

export const CHART_COLORS = {
  primary: '#3b82f6', // Blue
  success: '#10b981', // Emerald
  warning: '#f59e0b', // Amber
  danger: '#ef4444', // Red
  accent: '#8b5cf6', // Purple
  info: '#06b6d4', // Cyan
  secondary: '#ec4899', // Pink
  tertiary: '#14b8a6', // Teal
} as const;

export const ACTION_TYPE_COLORS: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  READ: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  LOGIN: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  LOGOUT: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
} as const;

export const USER_STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#10b981', // Emerald
  INACTIVE: '#6b7280', // Gray
  SUSPENDED: '#ef4444', // Red
  PENDING: '#f59e0b', // Amber
  PENDING_VERIFICATION: '#8b5cf6', // Purple
} as const;

export const GRADIENT_COLORS = {
  blue: 'from-blue-600 to-blue-700',
  emerald: 'from-emerald-600 to-emerald-700',
  purple: 'from-purple-600 to-purple-700',
  amber: 'from-amber-600 to-amber-700',
  cyan: 'from-cyan-600 to-cyan-700',
  violet: 'from-violet-600 to-violet-700',
  pink: 'from-pink-600 to-pink-700',
} as const;

export const TIME_RANGE_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7days' },
  { label: 'Last 30 days', value: '30days' },
  { label: 'Last 90 days', value: '90days' },
  { label: 'This Quarter', value: 'quarter' },
  { label: 'This Year', value: 'year' },
] as const;

export const DATA_RETENTION_OPTIONS = [
  { label: '30 Days', value: '30' },
  { label: '60 Days', value: '60' },
  { label: '90 Days', value: '90' },
  { label: '180 Days', value: '180' },
  { label: '365 Days', value: '365' },
] as const;

export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;

export const FORM_MODULE_COUNT = 15;

export const AUDIT_LOG_PAGE_SIZE = 10;
export const USER_ANALYTICS_LIMIT = 100;

export const CHART_CONFIG = {
  margin: { top: 10, right: 30, left: 0, bottom: 0 },
  strokeDasharray: '3 3',
  animationDuration: 300,
} as const;

export const DATE_FORMAT_OPTIONS = {
  short: 'MMM d, yyyy',
  long: 'MMMM d, yyyy h:mm a',
  full: 'EEEE, MMMM d, yyyy',
} as const;

export const METRIC_UNITS = {
  users: 'Users',
  submissions: 'Submissions',
  entries: 'Entries',
  logins: 'Logins',
} as const;

/**
 * Get display name for action type
 */
export function getActionDisplayName(action: string): string {
  const displayMap: Record<string, string> = {
    CREATE: 'Created',
    UPDATE: 'Updated',
    DELETE: 'Deleted',
    READ: 'Viewed',
    LOGIN: 'Logged In',
    LOGOUT: 'Logged Out',
  };
  return displayMap[action.toUpperCase()] || action;
}

/**
 * Format large numbers with abbreviations
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(current: number, previous: number): {
  change: number;
  isIncrease: boolean;
} {
  if (previous === 0) return { change: 0, isIncrease: true };
  const change = ((current - previous) / previous) * 100;
  return {
    change: Math.abs(change),
    isIncrease: change >= 0,
  };
}

/**
 * Format date for display
 */
export function formatDateRange(startDate: string, endDate: string): string {
  return `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
}
