"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface DialogSize {
  width: number;
  height: number;
}

interface UseDialogResizeOptions {
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

interface UseDialogResizeResult {
  dialogSize: DialogSize;
  isResizing: boolean;
  dialogRef: React.RefObject<HTMLDivElement>;
  startResize: (e: React.MouseEvent<HTMLDivElement>, direction: string) => void;
}

const CURSOR_MAP: Record<string, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  nw: "nw-resize",
  ne: "ne-resize",
  sw: "sw-resize",
  se: "se-resize",
};

/**
 * Encapsulates resizable-dialog logic extracted from PublicFormDialog.
 * Handles mouse events for 8-direction resize and resets size when dialog closes.
 *
 * @param isOpen  - Whether the dialog is currently open. When it closes the size resets.
 * @param options - Optional size defaults and constraints.
 */
export function useDialogResize(
  isOpen: boolean,
  {
    defaultWidth = 1400,
    defaultHeight = 700,
    minWidth = 600,
    minHeight = 400,
  }: UseDialogResizeOptions = {},
): UseDialogResizeResult {
  const [dialogSize, setDialogSize] = useState<DialogSize>({
    width: defaultWidth,
    height: defaultHeight,
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Reset size when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setDialogSize({ width: defaultWidth, height: defaultHeight });
    }
  }, [isOpen, defaultWidth, defaultHeight]);

  // Attach / detach mouse listeners while resizing
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      let newWidth = resizeStart.current.width;
      let newHeight = resizeStart.current.height;
      if (resizeDirection.includes("e")) newWidth += dx;
      if (resizeDirection.includes("w")) newWidth -= dx;
      if (resizeDirection.includes("s")) newHeight += dy;
      if (resizeDirection.includes("n")) newHeight -= dy;
      setDialogSize({
        width: Math.max(minWidth, newWidth),
        height: Math.max(minHeight, newHeight),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection("");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = CURSOR_MAP[resizeDirection] || "default";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, resizeDirection, minWidth, minHeight]);

  const startResize = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, direction: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dialogRef.current) return;
      const rect = dialogRef.current.getBoundingClientRect();
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
      };
      setResizeDirection(direction);
      setIsResizing(true);
    },
    [],
  );

  return { dialogSize, isResizing, dialogRef, startResize };
}
