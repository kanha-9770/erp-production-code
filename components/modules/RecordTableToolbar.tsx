"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Filter,
  Search,
  SlidersHorizontal,
  WrapText,
  Columns,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Bookmark,
  Trash2,
  Loader2,
  Plus,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FieldFilter,
  ConditionalFormatRule,
  FormFieldWithSection,
} from "@/types/records";
import {
  useGetSavedFiltersQuery,
  useDeleteSavedFilterMutation,
} from "@/lib/api/saved-filters";

interface RecordTableToolbarProps {
  isFilterSidebarOpen: boolean;
  setIsFilterSidebarOpen: (open: boolean) => void;
  activeFieldFilters: FieldFilter[];
  recordSearchQuery: string;
  setRecordSearchQuery: (q: string) => void;
  recordsPerPage: number;
  setRecordsPerPage: (n: number) => void;
  conditionalRules: ConditionalFormatRule[];
  setConditionalRules: React.Dispatch<
    React.SetStateAction<ConditionalFormatRule[]>
  >;
  formFieldsWithSections: FormFieldWithSection[];
  isWrapTextEnabled: boolean;
  setIsWrapTextEnabled: (v: boolean) => void;
  setIsManageColumnsOpen: (v: boolean) => void;
  recordSortField: string;
  recordSortOrder: "asc" | "desc";
  setRecordSortField: (field: string) => void;
  setRecordSortOrder: (order: "asc" | "desc") => void;
  onSaveFilter?: () => void;
  canSaveFilter?: boolean;
  moduleId?: string;
  onApplySavedFilter?: (filters: FieldFilter[]) => void;
}

export function RecordTableToolbar({
  isFilterSidebarOpen,
  setIsFilterSidebarOpen,
  activeFieldFilters,
  recordSearchQuery,
  setRecordSearchQuery,
  recordsPerPage,
  setRecordsPerPage,
  conditionalRules,
  setConditionalRules,
  formFieldsWithSections,
  isWrapTextEnabled,
  setIsWrapTextEnabled,
  setIsManageColumnsOpen,
  recordSortField,
  recordSortOrder,
  setRecordSortField,
  setRecordSortOrder,
  onSaveFilter,
  canSaveFilter = false,
  moduleId,
  onApplySavedFilter,
}: RecordTableToolbarProps) {
  const [sortPopoverOpen, setSortPopoverOpen] = React.useState(false);
  const [sortFieldSearch, setSortFieldSearch] = React.useState("");
  const [fieldDropdownOpen, setFieldDropdownOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // ── Saved filters popover state ──
  const [savedPopoverOpen, setSavedPopoverOpen] = React.useState(false);
  const [savedSearch, setSavedSearch] = React.useState("");
  const [savedSortMode, setSavedSortMode] = React.useState<
    "newest" | "oldest" | "az" | "za"
  >("newest");

  const { data: savedFiltersResponse, isLoading: isLoadingSavedFilters } =
    useGetSavedFiltersQuery(moduleId || "", { skip: !moduleId });
  const [deleteSavedFilter, { isLoading: isDeletingSavedFilter }] =
    useDeleteSavedFilterMutation();
  const savedFilters = savedFiltersResponse?.data || [];

  const filteredSortedSavedFilters = React.useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    let list = q
      ? savedFilters.filter((f) => f.name.toLowerCase().includes(q))
      : savedFilters.slice();
    switch (savedSortMode) {
      case "az":
        list.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
        break;
      case "za":
        list.sort((a, b) =>
          b.name.localeCompare(a.name, undefined, { sensitivity: "base" })
        );
        break;
      case "oldest":
        list.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        break;
      case "newest":
      default:
        list.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
    }
    return list;
  }, [savedFilters, savedSearch, savedSortMode]);

  const isSameFilterSet = React.useCallback(
    (a: FieldFilter[], b: FieldFilter[]) => {
      if (a.length !== b.length) return false;
      return a.every((af) =>
        b.some(
          (bf) =>
            bf.fieldId === af.fieldId &&
            bf.operator === af.operator &&
            bf.value === af.value
        )
      );
    },
    []
  );

  const handleApplySavedFilter = (filters: FieldFilter[]) => {
    if (onApplySavedFilter) {
      onApplySavedFilter(filters);
    }
    setSavedPopoverOpen(false);
  };

  const handleDeleteSavedFilter = async (id: string) => {
    try {
      await deleteSavedFilter(id).unwrap();
    } catch (err) {
      console.error("Failed to delete saved filter:", err);
    }
  };

  // Reset popover-local state when it closes
  React.useEffect(() => {
    if (!savedPopoverOpen) {
      setSavedSearch("");
    }
  }, [savedPopoverOpen]);

  const sortableFields = formFieldsWithSections.filter(
    (f) => !["image", "file", "signature"].includes(f.type)
  );

  const filteredSortFields = sortableFields.filter((f) =>
    f.label.toLowerCase().includes(sortFieldSearch.toLowerCase())
  );

  const activeSortLabel = sortableFields.find(
    (f) => f.id === recordSortField
  )?.label;

  // Reset search when popover closes
  React.useEffect(() => {
    if (!sortPopoverOpen) {
      setSortFieldSearch("");
      setFieldDropdownOpen(false);
    }
  }, [sortPopoverOpen]);

  // Auto-focus search when field dropdown opens
  React.useEffect(() => {
    if (fieldDropdownOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [fieldDropdownOpen]);

  const handleSelectField = (fieldId: string) => {
    if (fieldId === "") {
      setRecordSortField("");
    } else {
      setRecordSortField(fieldId);
      if (!recordSortOrder) setRecordSortOrder("asc");
    }
    setFieldDropdownOpen(false);
    setSortFieldSearch("");
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 w-full">
      {/* Left group: Filter, Sort, Save Filter */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Filter toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsFilterSidebarOpen(!isFilterSidebarOpen)}
          className={cn(
            "h-8 gap-1.5 text-xs font-medium transition-all duration-200 border",
            activeFieldFilters.length > 0
              ? "border-indigo-400 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-500 shadow-sm"
              : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
          {activeFieldFilters.length > 0 && (
            <span className="bg-indigo-600 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
              {activeFieldFilters.length}
            </span>
          )}
        </Button>

        {/* Sort popover */}
        <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs font-medium transition-all duration-200 border",
                recordSortField
                  ? "border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-500 shadow-sm"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800"
              )}
            >
              {recordSortField ? (
                recordSortOrder === "asc" ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Sort</span>
              {activeSortLabel && (
                <span className="max-w-[80px] truncate text-[10px] font-semibold bg-violet-600 text-white rounded px-1.5 py-0.5 leading-none">
                  {activeSortLabel}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-[320px] p-0 rounded-lg shadow-xl border border-gray-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50/80 rounded-t-lg">
              <span className="text-xs font-semibold text-gray-800">
                Sort By
              </span>
              {recordSortField && (
                <button
                  onClick={() => {
                    setRecordSortField("");
                    setSortPopoverOpen(false);
                  }}
                  className="text-[10px] font-medium text-red-400 hover:text-red-600 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="p-3 space-y-2.5">
              {/* Row: Field selector + Order selector */}
              <div className="flex items-center gap-2">
                {/* Custom field dropdown */}
                <div className="flex-1 min-w-0 relative">
                  <button
                    type="button"
                    onClick={() => setFieldDropdownOpen(!fieldDropdownOpen)}
                    className={cn(
                      "w-full h-8 px-2.5 flex items-center justify-between text-xs border rounded-md bg-white transition-all",
                      fieldDropdownOpen
                        ? "border-violet-400 ring-1 ring-violet-400"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <span
                      className={cn(
                        "truncate",
                        recordSortField
                          ? "text-gray-900 font-medium"
                          : "text-gray-400"
                      )}
                    >
                      {activeSortLabel || "None"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform",
                        fieldDropdownOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {/* Custom dropdown panel */}
                  {fieldDropdownOpen && (
                    <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-50 overflow-hidden">
                      {/* Search input */}
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                          <input
                            ref={searchInputRef}
                            placeholder="Search"
                            value={sortFieldSearch}
                            onChange={(e) =>
                              setSortFieldSearch(e.target.value)
                            }
                            className="w-full pl-7 pr-2 h-7 text-xs border border-gray-200 rounded outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 bg-gray-50/80 placeholder:text-gray-400"
                          />
                        </div>
                      </div>

                      {/* Options list */}
                      <div className="max-h-[220px] overflow-y-auto py-1">
                        {/* None */}
                        <button
                          type="button"
                          onClick={() => handleSelectField("")}
                          className={cn(
                            "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-violet-50 transition-colors",
                            !recordSortField && "bg-violet-50"
                          )}
                        >
                          <span className="w-4 flex-shrink-0">
                            {!recordSortField && (
                              <Check className="h-3.5 w-3.5 text-violet-600" />
                            )}
                          </span>
                          <span
                            className={cn(
                              !recordSortField
                                ? "font-medium text-violet-700"
                                : "text-gray-700"
                            )}
                          >
                            None
                          </span>
                        </button>

                        {/* Fields */}
                        {filteredSortFields.map((field) => {
                          const isActive = recordSortField === field.id;
                          return (
                            <button
                              key={field.id}
                              type="button"
                              onClick={() => handleSelectField(field.id)}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-violet-50 transition-colors",
                                isActive && "bg-violet-50"
                              )}
                            >
                              <span className="w-4 flex-shrink-0">
                                {isActive && (
                                  <Check className="h-3.5 w-3.5 text-violet-600" />
                                )}
                              </span>
                              <span
                                className={cn(
                                  "truncate",
                                  isActive
                                    ? "font-medium text-violet-700"
                                    : "text-gray-700"
                                )}
                              >
                                {field.label}
                              </span>
                            </button>
                          );
                        })}

                        {filteredSortFields.length === 0 &&
                          sortFieldSearch && (
                            <div className="px-3 py-3 text-xs text-gray-400 text-center">
                              No fields match "{sortFieldSearch}"
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Order selector */}
                <Select
                  value={recordSortOrder}
                  onValueChange={(v) =>
                    setRecordSortOrder(v as "asc" | "desc")
                  }
                  disabled={!recordSortField}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-[110px] text-xs border-gray-200 rounded-md bg-white focus:ring-1 focus:ring-violet-400 focus:border-violet-400",
                      !recordSortField && "opacity-50"
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc" className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <ArrowUp className="h-3 w-3" />
                        Ascending
                      </div>
                    </SelectItem>
                    <SelectItem value="desc" className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <ArrowDown className="h-3 w-3" />
                        Descending
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Saved Filters - popover beside Sort */}
        {moduleId && (
          <Popover open={savedPopoverOpen} onOpenChange={setSavedPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-xs font-medium transition-all duration-200 border",
                  savedFilters.length > 0
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500 shadow-sm"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800"
                )}
                title="Saved filters"
              >
                <Bookmark className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Saved</span>
                {savedFilters.length > 0 && (
                  <span className="bg-emerald-600 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                    {savedFilters.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-[320px] p-0 rounded-lg shadow-xl border border-gray-200"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50/80 rounded-t-lg">
                <span className="text-xs font-semibold text-gray-800">
                  Saved Filters
                </span>
                {canSaveFilter && onSaveFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setSavedPopoverOpen(false);
                      onSaveFilter();
                    }}
                    className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                    title="Save current filters"
                  >
                    <Plus className="h-3 w-3" />
                    Save current
                  </button>
                )}
              </div>

              {/* Search + sort row */}
              <div className="p-2 border-b border-gray-100 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search saved filters"
                    value={savedSearch}
                    onChange={(e) => setSavedSearch(e.target.value)}
                    className="w-full pl-7 pr-7 h-7 text-xs border border-gray-200 rounded outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 bg-gray-50/80 placeholder:text-gray-400"
                  />
                  {savedSearch && (
                    <button
                      onClick={() => setSavedSearch("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-500">
                    {filteredSortedSavedFilters.length} of {savedFilters.length}
                  </span>
                  <Select
                    value={savedSortMode}
                    onValueChange={(v) =>
                      setSavedSortMode(v as typeof savedSortMode)
                    }
                  >
                    <SelectTrigger className="h-6 w-[120px] text-[10px] px-2 border-gray-200 rounded">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest" className="text-xs">
                        Newest first
                      </SelectItem>
                      <SelectItem value="oldest" className="text-xs">
                        Oldest first
                      </SelectItem>
                      <SelectItem value="az" className="text-xs">
                        Name A → Z
                      </SelectItem>
                      <SelectItem value="za" className="text-xs">
                        Name Z → A
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* List */}
              <div className="max-h-[260px] overflow-y-auto py-1">
                {isLoadingSavedFilters ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="ml-2 text-xs text-gray-400">
                      Loading...
                    </span>
                  </div>
                ) : savedFilters.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-400">
                    No saved filters yet.
                    {canSaveFilter && (
                      <div className="mt-1 text-[10px]">
                        Apply some filters and click "Save current".
                      </div>
                    )}
                  </div>
                ) : filteredSortedSavedFilters.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-400">
                    No filters match "{savedSearch}"
                  </div>
                ) : (
                  filteredSortedSavedFilters.map((sf) => {
                    const isActive = isSameFilterSet(
                      sf.filters as FieldFilter[],
                      activeFieldFilters
                    );
                    return (
                      <div
                        key={sf.id}
                        className={cn(
                          "group flex items-center justify-between gap-2 px-3 py-1.5 mx-1 rounded-md cursor-pointer hover:bg-emerald-50 transition-colors",
                          isActive && "bg-emerald-50"
                        )}
                        onClick={() =>
                          handleApplySavedFilter(sf.filters as FieldFilter[])
                        }
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-3.5 flex-shrink-0">
                            {isActive && (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                "text-xs truncate",
                                isActive
                                  ? "font-semibold text-emerald-700"
                                  : "font-medium text-gray-800"
                              )}
                              title={sf.name}
                            >
                              {sf.name}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {sf.filters.length} filter
                              {sf.filters.length === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSavedFilter(sf.id);
                          }}
                          disabled={isDeletingSavedFilter}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-opacity flex-shrink-0"
                          title="Delete saved filter"
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Subtle divider */}
        <div className="hidden sm:block w-px h-5 bg-gray-200 mx-0.5" />
      </div>

      {/* Center: Search */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search all records..."
          value={recordSearchQuery}
          onChange={(e) => setRecordSearchQuery(e.target.value)}
          className="pl-8 pr-8 border-gray-200 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 h-8 text-xs rounded-md transition-all duration-200 hover:border-gray-300 w-full bg-white"
        />
        {recordSearchQuery && (
          <button
            onClick={() => setRecordSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Right group: Per-page, Column options */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Select
          value={recordsPerPage.toString()}
          onValueChange={(v) => setRecordsPerPage(Number(v))}
        >
          <SelectTrigger className="h-8 w-[120px] rounded-md border-gray-200 hover:border-gray-300 transition-all duration-200 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 100, 500, 1000].map((n) => (
              <SelectItem key={n} value={n.toString()} className="text-xs">
                {n} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-8 w-8 flex items-center justify-center bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-all"
              title="Column Options"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">
              Column Options
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setIsWrapTextEnabled(!isWrapTextEnabled)}
              className="cursor-pointer text-xs"
            >
              <WrapText className="h-3.5 w-3.5 mr-2" />
              {isWrapTextEnabled ? "Clip Text" : "Wrap Text"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setIsManageColumnsOpen(true)}
              className="cursor-pointer text-xs"
            >
              <Columns className="h-3.5 w-3.5 mr-2" /> Manage Columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
