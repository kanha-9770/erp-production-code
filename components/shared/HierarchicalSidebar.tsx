"use client";

import React, { useState, useEffect, useRef, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HierarchicalItem {
  id: string;
  name: string;
  description?: string;
  icon?: React.ComponentType<any>;
  children?: HierarchicalItem[];
  metadata?: Record<string, any>;
}

interface HierarchicalSidebarProps {
  items: HierarchicalItem[];
  title?: string;
  searchPlaceholder?: string;
  onItemClick?: (item: HierarchicalItem) => void;
  onItemSecondaryAction?: (item: HierarchicalItem) => void;
  renderItemContent?: (item: HierarchicalItem, isExpanded: boolean) => ReactNode;
  renderItemActions?: (item: HierarchicalItem) => ReactNode;
  selectedItemId?: string | null;
  className?: string;
  showSearch?: boolean;
  showSort?: boolean;
  resizable?: boolean;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  collapsible?: boolean;
  autoExpand?: boolean;
  searchFilter?: (item: HierarchicalItem, query: string) => boolean;
  headerActions?: ReactNode;
}

export const HierarchicalSidebar: React.FC<HierarchicalSidebarProps> = ({
  items,
  title = "Navigation",
  searchPlaceholder = "Search...",
  onItemClick,
  onItemSecondaryAction,
  renderItemContent,
  renderItemActions,
  selectedItemId,
  className,
  showSearch = true,
  showSort = true,
  resizable = false,
  minWidth = 150,
  maxWidth = 300,
  defaultWidth = 240,
  collapsible = true,
  autoExpand = false,
  searchFilter,
  headerActions,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [filteredItems, setFilteredItems] = useState<HierarchicalItem[]>(items);
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Load saved width from localStorage
  useEffect(() => {
    if (resizable && typeof window !== "undefined") {
      const saved = localStorage.getItem(`sidebar-${title}-width`);
      if (saved) {
        setWidth(parseInt(saved, 10));
      }
    }
  }, [resizable, title]);

  // Save width to localStorage
  useEffect(() => {
    if (resizable && typeof window !== "undefined") {
      localStorage.setItem(`sidebar-${title}-width`, width.toString());
    }
  }, [width, resizable, title]);

  // Handle resizing
  useEffect(() => {
    if (!resizable) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      } else if (newWidth < minWidth) {
        setWidth(minWidth);
      } else if (newWidth > maxWidth) {
        setWidth(maxWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, resizable, minWidth, maxWidth]);

  // Auto-expand items containing selected item
  useEffect(() => {
    if (autoExpand && selectedItemId) {
      const findPath = (items: HierarchicalItem[], targetId: string, path: string[] = []): string[] | null => {
        for (const item of items) {
          if (item.id === targetId) {
            return path;
          }
          if (item.children) {
            const childPath = findPath(item.children, targetId, [...path, item.id]);
            if (childPath) return childPath;
          }
        }
        return null;
      };

      const path = findPath(items, selectedItemId);
      if (path) {
        setExpandedItems(new Set(path));
      }
    }
  }, [selectedItemId, items, autoExpand]);

  // Default search filter
  const defaultSearchFilter = (item: HierarchicalItem, query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    return (
      item.name.toLowerCase().includes(lowerQuery) ||
      (item.description?.toLowerCase().includes(lowerQuery) ?? false)
    );
  };

  const filterFunction = searchFilter || defaultSearchFilter;

  // Filter and sort items
  useEffect(() => {
    let result = [...items];

    // Apply search filter
    if (searchQuery) {
      const filterItems = (items: HierarchicalItem[]): HierarchicalItem[] => {
        return items
          .filter((item) => {
            const matchesSelf = filterFunction(item, searchQuery);
            const hasMatchingChildren = item.children && filterItems(item.children).length > 0;
            return matchesSelf || hasMatchingChildren;
          })
          .map((item) => ({
            ...item,
            children: item.children ? filterItems(item.children) : undefined,
          }));
      };
      result = filterItems(result);
    }

    // Apply sorting
    const sortItems = (items: HierarchicalItem[]): HierarchicalItem[] => {
      const sorted = [...items].sort((a, b) => {
        return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      });
      return sorted.map((item) => ({
        ...item,
        children: item.children ? sortItems(item.children) : undefined,
      }));
    };
    result = sortItems(result);

    setFilteredItems(result);
  }, [items, searchQuery, sortOrder, searchFilter]);

  const toggleExpand = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const hasChildren = (item: HierarchicalItem) => {
    return item.children && item.children.length > 0;
  };

  const renderItem = (item: HierarchicalItem, level = 0): ReactNode => {
    const isExpanded = expandedItems.has(item.id);
    const isSelected = selectedItemId === item.id;
    const itemHasChildren = hasChildren(item);
    const IconComponent = item.icon;

    return (
      <div key={item.id} className="w-full">
        <div
          className={cn(
            "flex items-center w-full px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer group",
            isSelected && "bg-blue-50 border border-blue-200",
            !isSelected && "hover:bg-gray-100",
            itemHasChildren && "font-semibold"
          )}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => {
            if (itemHasChildren && collapsible) {
              toggleExpand(item.id);
            }
            if (onItemClick) {
              onItemClick(item);
            }
          }}
        >
          <div className="flex items-center flex-1 min-w-0">
            {IconComponent && (
              <IconComponent className="w-4 h-4 mr-2 flex-shrink-0 text-gray-600" />
            )}

            {renderItemContent ? (
              renderItemContent(item, isExpanded)
            ) : (
              <div className="flex-1 min-w-0">
                <span className="truncate text-gray-800">{item.name}</span>
                {item.description && (
                  <p className="text-xs text-gray-500 truncate">{item.description}</p>
                )}
              </div>
            )}

            {renderItemActions && (
              <div className="flex items-center gap-1 ml-2">
                {renderItemActions(item)}
              </div>
            )}
          </div>

          {collapsible && itemHasChildren && (
            <div className="flex-shrink-0 ml-2">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </div>
          )}
        </div>

        {collapsible && itemHasChildren && isExpanded && (
          <div className="space-y-1 mt-1">
            {item.children!.map((child) => renderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={sidebarRef}
      className={cn(
        "bg-white border-r border-gray-200 shadow-sm flex flex-col relative",
        className
      )}
      style={
        resizable
          ? {
              width: `${width}px`,
              minWidth: `${minWidth}px`,
              maxWidth: `${maxWidth}px`,
              transition: isResizing ? "none" : "width 0.2s ease",
            }
          : undefined
      }
    >
      {/* Resizer Handle */}
      {resizable && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
          style={{
            backgroundColor: isResizing ? "#3b82f6" : "transparent",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
          }}
        />
      )}

      {/* Header */}
      <div className="py-3 px-4 space-y-3 flex-shrink-0 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          {headerActions}
        </div>

        {(showSearch || showSort) && (
          <div className="flex items-center gap-2">
            {showSearch && (
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 border-gray-300 focus:ring-blue-500 text-sm h-9"
                />
              </div>
            )}
            {showSort && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="h-9 border-gray-300 text-gray-700 hover:bg-gray-100"
                title={sortOrder === "asc" ? "Sort Z-A" : "Sort A-Z"}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {filteredItems.length > 0 ? (
          <div className="space-y-1">
            {filteredItems.map((item) => renderItem(item))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8 text-sm">
            {searchQuery ? `No items found matching "${searchQuery}"` : "No items available"}
          </div>
        )}
      </div>
    </div>
  );
};

export default HierarchicalSidebar;
