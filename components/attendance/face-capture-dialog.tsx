"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCcw, Loader2, AlertTriangle, CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaceCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The configured mode at capture time. REQUIRED hides the "Skip" button
  // and any wording that suggests proceeding without a photo.
  mode: "OPTIONAL" | "REQUIRED";
  // When the user confirms a frame, we pass the captured Blob (image/jpeg
  // by default). Caller is responsible for upload + the actual punch.
  onCapture: (blob: Blob) => Promise<void> | void;
  onSkip?: () => void;
  // Optional context shown at the top of the dialog. Lets the widget say
  // "Check In" vs "Check Out" so the user knows what they're confirming.
  actionLabel: string;
  busy?: boolean;
}

const TARGET_WIDTH = 640;
const TARGET_HEIGHT = 480;
const JPEG_QUALITY = 0.82;

export function FaceCaptureDialog({
  open,
  onOpenChange,
  mode,
  onCapture,
  onSkip,
  actionLabel,
  busy = false,
}: FaceCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  // Tear down the camera reliably. iOS in particular leaks the indicator
  // dot if any track stays live, so we stop every track explicitly.
  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        /* ignore */
      }
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera not supported in this browser");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: TARGET_WIDTH },
          height: { ideal: TARGET_HEIGHT },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // play() can reject on autoplay policies; the visible play state
        // still works once the user interacts, so silence the rejection.
        videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      const name = e?.name as string | undefined;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Camera permission denied. Allow access in your browser settings and try again.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No camera found on this device.");
      } else if (name === "NotReadableError") {
        setError("Camera is in use by another application.");
      } else {
        setError(e?.message ?? "Could not start camera");
      }
    } finally {
      setStarting(false);
    }
  }, []);

  // Lifecycle: start on open, stop on close. Capture preview blob URLs are
  // revoked when replaced or on close so we don't leak object URLs.
  useEffect(() => {
    if (!open) {
      stopCamera();
      setCapturedBlob(null);
      setCapturedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(null);
      return;
    }
    setCapturedBlob(null);
    setCapturedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    startCamera();
    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Match the canvas to the actual frame. Some phones return a stream
    // bigger or smaller than the ideal, so we use the live video size
    // rather than the constraint constants.
    const w = video.videoWidth || TARGET_WIDTH;
    const h = video.videoHeight || TARGET_HEIGHT;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror flip — the user expects the captured photo to match what
    // they see on-screen (which is mirrored to feel like a, well, mirror).
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!capturedBlob) return;
    await onCapture(capturedBlob);
  }, [capturedBlob, onCapture]);

  const handleRetake = useCallback(() => {
    setCapturedBlob(null);
    setCapturedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Capture a photo for {actionLabel}</DialogTitle>
          <DialogDescription>
            {mode === "REQUIRED"
              ? "A face photo is required. We use it as proof of attendance — only your admin can view it."
              : "Optional photo for proof of attendance. Skip if you can't enable the camera."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full overflow-hidden rounded-lg border border-black/10 bg-gray-50">
          {/* Live video — visible only when no capture is held */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn(
              "block w-full max-h-[55vh] object-contain bg-black",
              "scale-x-[-1]", // mirror like every other camera UI
              capturedUrl && "hidden",
            )}
          />
          {capturedUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capturedUrl}
              alt="Captured frame"
              className="block w-full max-h-[55vh] object-contain bg-black"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />

          {starting && !capturedUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Starting camera…
            </div>
          )}
          {error && !capturedUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 p-4 text-center">
              <CameraOff className="h-8 w-8 text-red-500" />
              <div className="text-sm font-medium text-red-700">{error}</div>
              <Button type="button" size="sm" variant="outline" onClick={startCamera}>
                Retry
              </Button>
            </div>
          )}
        </div>

        {mode === "OPTIONAL" && error && (
          <div className="flex items-start gap-2 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            You can still proceed without a photo since capture is optional.
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex gap-2">
            {mode === "OPTIONAL" && onSkip && (
              <Button
                type="button"
                variant="outline"
                onClick={onSkip}
                disabled={busy}
              >
                Skip photo
              </Button>
            )}
          </div>
          <div className="flex gap-2 sm:justify-end">
            {capturedBlob ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRetake}
                  disabled={busy}
                >
                  <RefreshCcw className="h-4 w-4 mr-1.5" />
                  Retake
                </Button>
                <Button type="button" onClick={handleConfirm} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 mr-1.5" />
                  )}
                  Use this photo
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={handleCapture}
                disabled={busy || !!error || starting}
              >
                <Camera className="h-4 w-4 mr-1.5" />
                Capture
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
