"use client"

/**
 * AvatarCropper — crop / zoom / rotate an image before it's uploaded.
 *
 * Sits between "user picked or captured an image" and the actual upload:
 * the file/camera paths hand a source image to this dialog, the user frames
 * it inside a circular guide, and on "Apply" we render the framed square to
 * a fresh canvas and hand back a downscaled JPEG `File`.
 *
 * Self-contained (no crop library): a single canvas renders the live preview
 * AND produces the final output via the same `paint()` routine, so what the
 * user sees is exactly what gets uploaded. Pan (drag), zoom (slider / wheel)
 * and 90° rotation are all baked into the canvas transform.
 *
 * The output is always a square (avatars are masked to a circle at display
 * time), and pan is clamped so the image always fully covers the crop square —
 * there are never empty/letterboxed edges.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Loader2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Check,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Logical size of the on-screen crop square (CSS px). Drag math assumes the
// canvas is displayed at exactly this size, so the element is fixed to it
// (fits even narrow phones). The backing store is multiplied by DPR for
// sharpness; output is rendered separately at OUTPUT px.
const PREVIEW = 288
const OUTPUT = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 4

type Pan = { x: number; y: number }

export interface AvatarCropperProps {
  open: boolean
  /** Object URL (or data URL) of the image being cropped. */
  src: string | null
  /** Original file name — used to name the cropped output. */
  fileName?: string
  onCancel: () => void
  /** Receives the cropped, downscaled square JPEG ready to upload. */
  onCropped: (file: File) => void
}

export default function AvatarCropper({
  open,
  src,
  fileName,
  onCancel,
  onCropped,
}: AvatarCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dprRef = useRef(1)
  const dragRef = useRef<{ x: number; y: number; pan: Pan } | null>(null)

  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0) // 0 | 90 | 180 | 270
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    dprRef.current = Math.min(window.devicePixelRatio || 1, 3)
  }, [])

  // Keep pan within the bounds that guarantee the image covers the whole
  // crop square (no empty edges). Recomputed whenever zoom or rotation change.
  const clampPan = useCallback((p: Pan, z: number, rot: number): Pan => {
    const img = imgRef.current
    if (!img) return p
    const quarter = rot % 180 !== 0
    const rW = quarter ? img.naturalHeight : img.naturalWidth
    const rH = quarter ? img.naturalWidth : img.naturalHeight
    const cover = Math.max(PREVIEW / rW, PREVIEW / rH)
    const scale = cover * z
    const maxX = Math.max(0, (rW * scale - PREVIEW) / 2)
    const maxY = Math.max(0, (rH * scale - PREVIEW) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, p.x)),
      y: Math.min(maxY, Math.max(-maxY, p.y)),
    }
  }, [])

  // Single draw routine for BOTH the preview and the final output. `size` is
  // the logical square side; pan (stored in PREVIEW px) is scaled to `size`.
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, size: number, dpr: number, z: number, rot: number, p: Pan) => {
      const img = imgRef.current
      if (!img) return
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      const quarter = rot % 180 !== 0
      const rW = quarter ? ih : iw
      const rH = quarter ? iw : ih
      const cover = Math.max(size / rW, size / rH)
      const scale = cover * z
      const panFactor = size / PREVIEW

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, size, size)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.translate(size / 2 + p.x * panFactor, size / 2 + p.y * panFactor)
      ctx.rotate((rot * Math.PI) / 180)
      const dw = iw * scale
      const dh = ih * scale
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    },
    [],
  )

  // (Re)load the source image whenever it changes, resetting the transform.
  useEffect(() => {
    if (!open || !src) return
    setLoaded(false)
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => {
      imgRef.current = image
      setZoom(1)
      setRotation(0)
      setPan({ x: 0, y: 0 })
      setLoaded(true)
    }
    image.src = src
    return () => {
      image.onload = null
    }
  }, [open, src])

  // Repaint the preview on every transform change (and once the image loads /
  // the canvas mounts).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !loaded) return
    const dpr = dprRef.current
    const backing = PREVIEW * dpr
    if (canvas.width !== backing) {
      canvas.width = backing
      canvas.height = backing
    }
    const ctx = canvas.getContext("2d")
    if (ctx) paint(ctx, PREVIEW, dpr, zoom, rotation, pan)
  }, [loaded, zoom, rotation, pan, paint])

  const applyZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    setZoom(z)
    setPan((p) => clampPan(p, z, rotation))
  }

  const rotate = (dir: -1 | 1) => {
    const next = (((rotation + dir * 90) % 360) + 360) % 360
    setRotation(next)
    setPan((p) => clampPan(p, zoom, next))
  }

  const reset = () => {
    setZoom(1)
    setRotation(0)
    setPan({ x: 0, y: 0 })
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, pan }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current
    if (!d) return
    // Canvas is displayed at exactly PREVIEW px, so client-px deltas map 1:1
    // to the logical pan space.
    const nextPan = { x: d.pan.x + (e.clientX - d.x), y: d.pan.y + (e.clientY - d.y) }
    setPan(clampPan(nextPan, zoom, rotation))
  }

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!loaded) return
    applyZoom(zoom - e.deltaY * 0.0015)
  }

  const apply = async () => {
    const img = imgRef.current
    if (!img) return
    setProcessing(true)
    try {
      const out = document.createElement("canvas")
      out.width = OUTPUT
      out.height = OUTPUT
      const ctx = out.getContext("2d")
      if (!ctx) return
      paint(ctx, OUTPUT, 1, zoom, rotation, pan)
      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      )
      if (!blob) return
      const base = (fileName || "photo").replace(/\.[^./\\]+$/, "")
      onCropped(new File([blob], `${base}.jpg`, { type: "image/jpeg" }))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="text-lg">Crop photo</DialogTitle>
          <DialogDescription>
            Drag to reposition, pinch or scroll to zoom, and rotate to straighten.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Crop stage — square canvas with a circular framing guide. */}
          <div
            className="relative mx-auto bg-muted rounded-xl overflow-hidden ring-1 ring-border"
            style={{ width: PREVIEW, height: PREVIEW, maxWidth: "100%" }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={onWheel}
              className={cn(
                "block touch-none select-none",
                loaded ? "cursor-grab active:cursor-grabbing" : "cursor-default",
              )}
              style={{ width: PREVIEW, height: PREVIEW }}
            />
            {/* Circular guide — the avatar is masked to this circle on display.
                The huge box-shadow darkens everything outside it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="h-full w-full rounded-full border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Slider
              value={[zoom]}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              onValueChange={([v]) => applyZoom(v)}
              disabled={!loaded}
              aria-label="Zoom"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          {/* Rotate / reset */}
          <div className="flex items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => rotate(-1)} disabled={!loaded}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Left
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => rotate(1)} disabled={!loaded}>
              <RotateCw className="h-4 w-4 mr-1.5" />
              Right
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={!loaded}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Reset
            </Button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={processing}>
              Cancel
            </Button>
            <Button type="button" onClick={apply} disabled={!loaded || processing} className="min-w-[120px]">
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Apply
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
