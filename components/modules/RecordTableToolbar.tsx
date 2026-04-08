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
import { Filter, Search, SlidersHorizontal, WrapText, Columns, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldFilter, ConditionalFormatRule, FormFieldWithSection } from "@/types/records";

interface RecordTableToolbarProps {
  isFilterSidebarOpen: boolean;
  setIsFilterSidebarOpen: (open: boolean) => void;
  activeFieldFilters: FieldFilter[];
  recordSearchQuery: string;
  setRecordSearchQuery: (q: string) => void;
  recordsPerPage: number;
  setRecordsPerPage: (n: number) => void;
  conditionalRules: ConditionalFormatRule[];
  setConditionalRules: React.Dispatch<React.SetStateAction<ConditionalFormatRule[]>>;
  formFieldsWithSections: FormFieldWithSection[];
  isWrapTextEnabled: boolean;
  setIsWrapTextEnabled: (v: boolean) => void;
  setIsManageColumnsOpen: (v: boolean) => void;
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
}: RecordTableToolbarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full relative">

      {/* ── Mobile Row 1 / Desktop: Filter + Search inline ── */}
      <div className="flex flex-row items-center gap-2 sm:contents">
        {/* Filter toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsFilterSidebarOpen(!isFilterSidebarOpen)}
          className={cn(
            "h-9 gap-2 flex-shrink-0 transition-all duration-200",
            activeFieldFilters.length > 0
              ? "border-blue-500 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700"
              : "hover:bg-gray-50 hover:border-gray-400",
          )}
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFieldFilters.length > 0 && (
            <span className="bg-white text-blue-600 text-xs font-bold rounded-full px-2 py-0.5 ml-1 shadow-sm">
              {activeFieldFilters.length}
            </span>
          )}
        </Button>

        {/* Search */}
        <div className="relative flex-1 min-w-0 sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search all records..."
            value={recordSearchQuery}
            onChange={(e) => setRecordSearchQuery(e.target.value)}
            className="pl-10 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-9 text-sm rounded-lg transition-all duration-200 hover:border-gray-400 w-full"
          />
        </div>
      </div>

      {/* ── Mobile Row 2 / Desktop: Right controls inline ── */}
      <div className="flex flex-row items-center gap-2 sm:contents">
        {/* Per-page select */}
        <Select
          value={recordsPerPage.toString()}
          onValueChange={(v) => setRecordsPerPage(Number(v))}
        >
          <SelectTrigger className="h-9 w-[140px] rounded-lg border-gray-300 hover:border-gray-400 transition-all duration-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 100, 300, 500].map((n) => (
              <SelectItem key={n} value={n.toString()}>
                {n} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Column options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="bg-white border border-gray-300 rounded-md p-1.5 hover:bg-gray-100 hover:border-gray-400 transition-all shadow-sm flex-shrink-0"
              title="Column Options"
            >
              <SlidersHorizontal className="w-4 h-4 text-black" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Column Options</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setIsWrapTextEnabled(!isWrapTextEnabled)}
              className="cursor-pointer"
            >
              <WrapText className="h-4 w-4 mr-2" />{" "}
              {isWrapTextEnabled ? "Clip Text" : "Wrap Text"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setIsManageColumnsOpen(true)}
              className="cursor-pointer"
            >
              <Columns className="h-4 w-4 mr-2" /> Manage Columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  );
}