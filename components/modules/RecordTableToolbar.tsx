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
  Save,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FieldFilter,
  ConditionalFormatRule,
  FormFieldWithSection,
} from "@/types/records";

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
}: RecordTableToolbarProps) {
  const [sortPopoverOpen, setSortPopoverOpen] = React.useState(false);
  const [sortFieldSearch, setSortFieldSearch] = React.useState("");
  const [fieldDropdownOpen, setFieldDropdownOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

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

        {/* Save Filter - beside Sort */}
        {canSaveFilter && onSaveFilter && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSaveFilter}
            className="h-8 gap-1.5 text-xs font-medium transition-all duration-200 border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500 shadow-sm"
            title="Save current filters"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Save</span>
          </Button>
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
