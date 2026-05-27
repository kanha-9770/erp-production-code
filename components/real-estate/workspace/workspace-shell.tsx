"use client";

import { ReactNode, useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ChevronLeft, X, Maximize2, Minimize2 } from "lucide-react";
import { useLocalStorage } from "./use-local-storage";

/**
 * The list-and-preview shell every REBM list page sits in.
 *
 * Behaviour:
 *  - Desktop: resizable horizontal split, sizes persisted per scope.
 *  - Mobile (< md): list takes full width; selecting an item slides a Sheet
 *    in from the right with the preview.
 *  - When `selectedId` is null the preview pane collapses (list goes
 *    full-width). Re-opens automatically the next time you select.
 *
 * `scope` keys the persisted layout — give each page its own ("properties",
 * "agents", "leads", "transactions") so users can have a wide-list view in
 * one and a wide-preview view in another.
 */

interface WorkspaceShellProps {
  scope: string;
  header: ReactNode;
  list: ReactNode;
  preview: ReactNode | null;
  selectedId: string | null;
  onCloseSelection: () => void;
  /** Optional preview header (avatar, breadcrumb, actions) — sticks above the preview body. */
  previewHeader?: ReactNode;
  /** Default size of the list pane in % when no saved value (default 55). */
  defaultListSize?: number;
}

export function WorkspaceShell({
  scope,
  header,
  list,
  preview,
  selectedId,
  onCloseSelection,
  previewHeader,
  defaultListSize = 55,
}: WorkspaceShellProps) {
  const [layout, setLayout] = useLocalStorage<[number, number]>(
    `rebm:layout:${scope}`,
    [defaultListSize, 100 - defaultListSize],
  );
  const [previewMaximized, setPreviewMaximized] = useState(false);

  // Detect mobile via media query.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const showPreview = !!selectedId && !!preview;

  return (
    // h-full fills the parent <main> exactly. We previously used
    // `h-[calc(100vh-var(--header-height,4rem))]` which, on mobile, was
    // taller than the actual visible viewport (browser URL bar eats into
    // 100vh) — that pushed the workspace shell past its parent's height
    // and the *outer* <main> scroll kicked in, dragging the whole shell
    // (header included) up with the page. With h-full + the parent's
    // own flex layout the header now stays fixed and only the body
    // scrolls internally.
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header — non-scrolling, always visible at the top. Solid bg +
          high z so the DataTable thead's bg-muted (sticky z-30 inside
          the body) can never bleed through. */}
      <div className="border-b bg-background shrink-0 z-40">
        {header}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isMobile ? (
          <>
            <div className="h-full overflow-auto">{list}</div>
            <Sheet open={showPreview} onOpenChange={(o) => !o && onCloseSelection()}>
              <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
                {previewHeader && (
                  <div className="border-b px-4 py-3 flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={onCloseSelection}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 min-w-0">{previewHeader}</div>
                  </div>
                )}
                <div className="flex-1 overflow-auto">{preview}</div>
              </SheetContent>
            </Sheet>
          </>
        ) : showPreview && previewMaximized ? (
          <div className="h-full flex flex-col">
            {previewHeader && (
              <PreviewBar
                onClose={onCloseSelection}
                onToggleSize={() => setPreviewMaximized(false)}
                maximized
              >
                {previewHeader}
              </PreviewBar>
            )}
            <div className="flex-1 overflow-auto">{preview}</div>
          </div>
        ) : showPreview ? (
          <ResizablePanelGroup
            direction="horizontal"
            onLayout={(sizes) => {
              if (sizes.length === 2) setLayout([sizes[0], sizes[1]]);
            }}
            className="h-full"
          >
            <ResizablePanel defaultSize={layout[0]} minSize={28}>
              <div className="h-full overflow-auto">{list}</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={layout[1]} minSize={28}>
              <div className="h-full flex flex-col">
                {previewHeader && (
                  <PreviewBar
                    onClose={onCloseSelection}
                    onToggleSize={() => setPreviewMaximized(true)}
                    maximized={false}
                  >
                    {previewHeader}
                  </PreviewBar>
                )}
                <div className="flex-1 overflow-auto">{preview}</div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="h-full overflow-auto">{list}</div>
        )}
      </div>
    </div>
  );
}

function PreviewBar({
  children,
  onClose,
  onToggleSize,
  maximized,
}: {
  children: ReactNode;
  onClose: () => void;
  onToggleSize: () => void;
  maximized: boolean;
}) {
  return (
    <div className="border-b px-3 py-2 flex items-center gap-2 bg-muted/30 sticky top-0 z-10">
      <div className="flex-1 min-w-0">{children}</div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSize}
        title={maximized ? "Restore split view" : "Maximize preview"}
        className="h-7 w-7 shrink-0"
      >
        {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        title="Close preview"
        className="h-7 w-7 shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Header row used at the top of each workspace shell — title left, actions right. */
export function WorkspaceHeader({
  icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}
