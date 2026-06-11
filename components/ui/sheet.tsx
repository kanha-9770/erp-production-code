"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * When true (and `side` is "left"/"right"), the sheet can be widened/narrowed by
   * dragging a handle on its inner edge with the mouse. Desktop only — on mobile
   * (`< sm`) the sheet stays full-width and the handle is hidden.
   */
  resizable?: boolean
  /** Initial desktop width in px (used when `resizable`). Defaults to 768. */
  defaultWidth?: number
  /** Minimum desktop width in px while resizing. Defaults to 400. */
  minWidth?: number
  /** Hide the built-in top-right close button (e.g. when the header renders its own). */
  hideClose?: boolean
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      side = "right",
      className,
      children,
      resizable = false,
      defaultWidth = 768,
      minWidth = 400,
      hideClose = false,
      style,
      ...props
    },
    ref
  ) => {
    const [width, setWidth] = React.useState(defaultWidth)
    const isHorizontal = side === "left" || side === "right"
    const canResize = resizable && isHorizontal

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        const startX = e.clientX
        const startWidth = width
        const maxWidth =
          typeof window !== "undefined" ? window.innerWidth * 0.95 : startWidth

        const onMove = (ev: PointerEvent) => {
          // Dragging toward the screen centre widens the sheet.
          const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX
          setWidth(Math.min(Math.max(startWidth + delta, minWidth), maxWidth))
        }
        const onUp = () => {
          document.body.style.removeProperty("user-select")
          document.body.style.removeProperty("cursor")
          window.removeEventListener("pointermove", onMove)
          window.removeEventListener("pointerup", onUp)
        }

        document.body.style.userSelect = "none"
        document.body.style.cursor = "col-resize"
        window.addEventListener("pointermove", onMove)
        window.addEventListener("pointerup", onUp)
      },
      [side, width, minWidth]
    )

    const mergedStyle = canResize
      ? ({ ...style, ["--sheet-width" as any]: `${width}px` } as React.CSSProperties)
      : style

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={ref}
          className={cn(
            sheetVariants({ side }),
            canResize && "w-full sm:w-[var(--sheet-width)] sm:max-w-[95vw]",
            className
          )}
          style={mergedStyle}
          {...props}
        >
          {canResize && (
            // Sticky, zero-height wrapper keeps the full-height grab bar pinned to the
            // viewport even when the sheet body (overflow-y-auto) is scrolled.
            <div className="pointer-events-none sticky top-0 z-50 hidden h-0 sm:block">
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                onPointerDown={handlePointerDown}
                className={cn(
                  "group pointer-events-auto absolute top-0 h-screen w-2 cursor-col-resize touch-none select-none",
                  side === "right" ? "left-0" : "right-0"
                )}
              >
                <div className="h-full w-px bg-border transition-colors group-hover:w-[3px] group-hover:bg-primary" />
              </div>
            </div>
          )}
          {children}
          {!hideClose && (
            <SheetPrimitive.Close className="absolute right-4 top-4 z-50 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
          )}
        </SheetPrimitive.Content>
      </SheetPortal>
    )
  }
)
SheetContent.displayName = SheetPrimitive.Content.displayName

interface SheetHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Render a close (X) button as the last child of the header. Because the header
   * is typically sticky, this stays pinned and tappable on mobile — unlike the
   * absolutely-positioned built-in close, which can scroll out of view or sit
   * behind an opaque sticky header. Pair with `hideClose` on `SheetContent`.
   */
  showClose?: boolean
}

const SheetHeader = ({
  className,
  children,
  showClose = false,
  ...props
}: SheetHeaderProps) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  >
    {children}
    {showClose && (
      <SheetPrimitive.Close className="-mr-1 shrink-0 rounded-md p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    )}
  </div>
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
