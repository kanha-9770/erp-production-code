/**
 * Barrel for the Real Estate workspace primitives. Import from here in
 * pages so the surface stays one short import line:
 *
 *   import {
 *     WorkspaceShell, WorkspaceHeader,
 *     DataTable, type ColumnDef,
 *     FilterChips, ActiveFilterPills,
 *     ViewsBar,
 *     InlineEditCell,
 *     useSavedViews,
 *     useTablePrefs,
 *     useCommandPalette,
 *   } from "@/components/real-estate/workspace";
 */

export { WorkspaceShell, WorkspaceHeader } from "./workspace-shell";
export { DataTable, type ColumnDef } from "./data-table";
export { FilterChips, ActiveFilterPills, type ChipOption } from "./filter-chips";
export { ViewsBar } from "./views-bar";
export { InlineEditCell } from "./inline-edit";
export { useSavedViews, type SavedView } from "./saved-views";
export { useTablePrefs, type TablePrefs } from "./table-prefs";
export { useLocalStorage } from "./use-local-storage";
export {
  CommandPaletteProvider,
  useCommandPalette,
} from "./command-palette";
export {
  AdvancedFilter,
  type FilterField,
  type FilterFieldType,
  type FilterCondition,
} from "./advanced-filter";
export {
  applyAdvancedFilters,
  describeCondition,
} from "./apply-advanced-filters";
export { ManageColumnsButton } from "./manage-columns";
