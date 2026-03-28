'use client';

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
import { Search, Filter, SlidersHorizontal, X, WrapText, Columns } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConditionalFormatRule, FieldFilter } from "./types";

interface RecordsToolbarProps {
  recordSearchQuery: string;
  setRecordSearchQuery: (query: string) => void;
  recordsPerPage: number;
  setRecordsPerPage: (count: number) => void;
  isFilterSidebarOpen: boolean;
  setIsFilterSidebarOpen: (open: boolean) => void;
  activeFieldFilters: FieldFilter[];
  conditionalRules: ConditionalFormatRule[];
  setConditionalRules: (rules: ConditionalFormatRule[]) => void;
  formFieldsWithSections: any[];
  isWrapTextEnabled: boolean;
  setIsWrapTextEnabled: (enabled: boolean) => void;
  isManageColumnsOpen: boolean;
  setIsManageColumnsOpen: (open: boolean) => void;
}

export const RecordsToolbar: React.FC<RecordsToolbarProps> = ({
  recordSearchQuery,
  setRecordSearchQuery,
  recordsPerPage,
  setRecordsPerPage,
  isFilterSidebarOpen,
  setIsFilterSidebarOpen,
  activeFieldFilters,
  conditionalRules,
  setConditionalRules,
  isWrapTextEnabled,
  setIsWrapTextEnabled,
  isManageColumnsOpen,
  setIsManageColumnsOpen,
  formFieldsWithSections,
}) => {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full relative">

      {/* ── Row 1 (mobile): Filter + Search ── */}
      <div className="flex items-center gap-2 w-full sm:contents">
        {/* Filter toggle — icon only on mobile, icon+text on desktop */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsFilterSidebarOpen(!isFilterSidebarOpen)}
          className={cn(
            "h-9 gap-1.5 flex-shrink-0 transition-all duration-200",
            activeFieldFilters.length > 0
              ? "border-blue-500 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700"
              : "hover:bg-gray-50 hover:border-gray-400"
          )}
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFieldFilters.length > 0 && (
            <span className="bg-white text-blue-600 text-xs font-bold rounded-full px-1.5 py-0.5 ml-0.5 shadow-sm">
              {activeFieldFilters.length}
            </span>
          )}
        </Button>

        {/* Search — takes remaining space */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search records..."
            value={recordSearchQuery}
            onChange={(e) => setRecordSearchQuery(e.target.value)}
            className="pl-10 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-9 text-sm rounded-lg transition-all duration-200 hover:border-gray-400 w-full"
          />
        </div>

        {/* Mobile-only: settings icon button (combines per-page + column options) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="sm:hidden bg-white border border-gray-300 rounded-md p-2 hover:bg-gray-100 hover:border-gray-400 transition-all shadow-sm flex-shrink-0"
              title="Settings"
            >
              <SlidersHorizontal className="w-4 h-4 text-gray-700" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Column options */}
            <DropdownMenuLabel>Column Options</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setIsWrapTextEnabled(!isWrapTextEnabled)}
              className="cursor-pointer"
            >
              <WrapText className="h-4 w-4 mr-2" />
              {isWrapTextEnabled ? "Clip Text" : "Wrap Text"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setIsManageColumnsOpen(true)}
              className="cursor-pointer"
            >
              <Columns className="h-4 w-4 mr-2" /> Manage Columns
            </DropdownMenuItem>

            {/* Per-page options */}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Records Per Page</DropdownMenuLabel>
            {[100, 200, 400, 500].map((n) => (
              <DropdownMenuItem
                key={n}
                className={cn("cursor-pointer", recordsPerPage === n && "bg-blue-50 font-medium text-blue-700")}
                onClick={() => setRecordsPerPage(n)}
              >
                {n} per page {recordsPerPage === n && "✓"}
              </DropdownMenuItem>
            ))}

            {/* Conditional formatting */}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              Conditional Formatting
              {conditionalRules.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-bold rounded-full px-2 py-0.5">
                  {conditionalRules.length}
                </span>
              )}
            </DropdownMenuLabel>
            {conditionalRules.length === 0 ? (
              <div className="text-center py-2 text-xs text-gray-500">No rules</div>
            ) : (
              conditionalRules.map((rule, idx) => {
                const fieldLabel =
                  formFieldsWithSections.find((f) => f.id === rule.fieldId)?.label || rule.fieldId;
                return (
                  <div key={idx} className="px-3 py-1.5 text-xs flex justify-between items-center">
                    <span>{fieldLabel} ({rule.condition})</span>
                  </div>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Desktop-only: Right controls (hidden on mobile) ── */}
      <div className="hidden sm:flex items-center gap-3">
        {/* Per-page select */}
        <Select
          value={recordsPerPage.toString()}
          onValueChange={(v) => setRecordsPerPage(Number(v))}
        >
          <SelectTrigger className="h-9 rounded-lg border-gray-300 hover:border-gray-400 transition-all duration-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[100, 200, 400, 500].map((n) => (
              <SelectItem key={n} value={n.toString()}>
                {n} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Conditional formatting dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 bg-transparent">
              <SlidersHorizontal className="h-4 w-4" />
              {conditionalRules.length > 0 && (
                <span className="bg-blue-100 text-blue-800 text-xs font-bold rounded-full px-2 py-0.5">
                  {conditionalRules.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96">
            <DropdownMenuLabel>Conditional Formatting</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {conditionalRules.length === 0 ? (
              <div className="text-center py-4 text-sm text-gray-500">No rules</div>
            ) : (
              conditionalRules.map((rule, idx) => {
                const fieldLabel =
                  formFieldsWithSections.find((f) => f.id === rule.fieldId)?.label || rule.fieldId;
                return (
                  <div
                    key={idx}
                    className="px-3 py-2 border-b last:border-b-0 text-xs flex justify-between items-center"
                  >
                    <span>
                      {fieldLabel} ({rule.condition})
                    </span>
                  </div>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
