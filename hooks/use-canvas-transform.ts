"use client"

import { useState, useRef, useCallback, useEffect } from "react"

interface Transform {
  x: number
  y: number
  scale: number
}

interface UseCanvasTransformOptions {
  initialScale?: number
  minScale?: number
  maxScale?: number
}

/**
 * Shared pan/zoom canvas hook used by OrganizationTree and RoleManagementSheet.
 */
export function useCanvasTransform({
  initialScale = 0.7,
  minScale = 0.1,
  maxScale = 3,
}: UseCanvasTransformOptions = {}) {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: initialScale })
  const [isPanning, setIsPanning] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  /** Center the canvas within its container. */
  const centerView = useCallback(
    (offsetX = 200, offsetY = 80, scale?: number) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setTransform({
        x: rect.width / 2 - offsetX,
        y: offsetY,
        scale: scale ?? (window.innerWidth < 640 ? 0.5 : 0.75),
      })
    },
    []
  )

  /** Zoom toward the mouse cursor on wheel scroll. */
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const factor = Math.pow(1.1, -e.deltaY / 120)
      setTransform((prev) => {
        const newScale = Math.min(Math.max(prev.scale * factor, minScale), maxScale)
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return prev
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        return {
          x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
          y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
          scale: newScale,
        }
      })
    },
    [minScale, maxScale]
  )

  /**
   * Attach the wheel listener to containerRef.current.
   * Returns a cleanup function. Call this inside a useEffect.
   */
  const attachWheelListener = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

  /** Start panning on mouse-down (ignores button/input clicks). */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, select, [role='button']")) return
    setIsPanning(true)
    e.preventDefault()
  }, [])

  useEffect(() => {
    if (!isPanning) return
    const onMove = (e: MouseEvent) =>
      setTransform((p) => ({ ...p, x: p.x + e.movementX, y: p.y + e.movementY }))
    const onUp = () => setIsPanning(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [isPanning])

  const zoomIn = useCallback(
    () => setTransform((p) => ({ ...p, scale: Math.min(p.scale + 0.1, maxScale) })),
    [maxScale]
  )
  const zoomOut = useCallback(
    () => setTransform((p) => ({ ...p, scale: Math.max(p.scale - 0.1, minScale) })),
    [minScale]
  )

  return {
    transform,
    setTransform,
    isPanning,
    containerRef,
    centerView,
    handleMouseDown,
    attachWheelListener,
    zoomIn,
    zoomOut,
  }
}
