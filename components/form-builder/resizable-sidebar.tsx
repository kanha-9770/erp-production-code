"use client";

import { ReactNode, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResizableSidebarProps {
  children: ReactNode;
  defaultWidth?: number; // Fixed width when expanded
  collapsedWidth?: number;
}

export default function ResizableSidebar({
  children,
  defaultWidth = 288, // same as your original w-72
  collapsedWidth = 100, // a bit wider than 48px to fit icons nicely
}: ResizableSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => setIsCollapsed((c) => !c);
  const currentWidth = isCollapsed ? collapsedWidth : defaultWidth;

  return (
    <aside
      className="flex-shrink-0 border-r bg-white transition-all duration-200 relative"
      style={{ width: currentWidth }}
    >
      {/* ==== Collapse Button (pinned to top-right) ==== */}
      <div className="absolute top-3 -right-5 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapse}
          className={`
      h-10 w-10 rounded-full bg-white shadow-lg border border-gray-300 
      hover:shadow-xl hover:bg-gray-50 hover:border-gray-400
      transition-all duration-200 flex items-center justify-center
      ${isCollapsed ? "translate-x-0" : ""}
    `}
          aria-label={isCollapsed ? "Expand palette" : "Collapse palette"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5 text-gray-700" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          )}
        </Button>
      </div>

      {/* ==== Content (hidden when collapsed) ==== */}
      <div
        className={`h-full overflow-y-auto transition-opacity duration-200 ${
          isCollapsed ? "opacity-100 pointer-events-none" : "opacity-100"
        }`}
      >
        {children}
      </div>
    </aside>
  );
}
