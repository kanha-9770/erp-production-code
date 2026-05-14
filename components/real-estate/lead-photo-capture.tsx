"use client";

/**
 * LeadPhotoCapture — minimalist in-browser camera for the lead-capture
 * form. Emits a `File` so the parent's existing upload+hash pipeline
 * (see `app/real-estate/leads/new/page.tsx#onPhotoPicked`) just works.
 *
 * Design rules (kept tight on purpose):
 *   - One button on the host page: "Take photo".
 *   - Tap → modal opens with a live camera preview (rear camera on
 *     mobile by default; `getUserMedia` falls back to whatever's
 *     available on desktop).
 *   - Tap the big circular shutter → freezes the frame and shows a
 *     side-by-side "Retake / Use this photo" pair.
 *   - "Use this photo" closes the dialog and hands a File to onCapture.
 *
 * No upload code here. No perceptual-hash code here. No business
 * vocabulary. The component only knows "open camera", "grab a frame",
 * "return a File". Everything else is the parent's job.
 *
 * Browser quirks handled:
 *   - getUserMedia denied / unsupported → friendly error + Cancel.
 *   - iOS Safari requires `playsInline` + a user gesture to start the
 *     video; both are in place.
 *   - We always stop every track on close + unmount so the camera
 *     light doesn't stay on after the dialog closes.
 *   - Some Android browsers refuse `facingMode: "environment"` as an
 *     `exact` constraint — we use it as an `ideal` hint and let the
 *     browser pick whatever camera it can give us.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LeadPhotoCaptureProps {
  /** Called with the captured frame as a JPEG `File`. */
  onCapture: (file: File) => void;
  /** Visible label on the trigger button. Defaults to "Take photo". */
  triggerLabel?: string;
  /** Disable the trigger (e.g. while a previous upload is in flight). */
  disabled?: boolean;
}

type Phase =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "preview" }
  | { kind: "frozen"; dataUrl: string }
  | { kind: "error"; message: string };

export function LeadPhotoCapture({
  onCapture,
  triggerLabel = "Take photo",
  disabled,
}: LeadPhotoCaptureProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (!s) return;
    s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    setPhase({ kind: "opening" });
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase({
        kind: "error",
        message: "Your browser doesn't support camera access. Use the Attach photo button instead.",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // `ideal`, not `exact` — broader compatibility, especially on
          // Android browsers that reject exact facingMode constraints.
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      // Wait a tick — the video element only exists once the dialog
      // mounts. The state change to `preview` triggers the render that
      // attaches the stream to the element below.
      setPhase({ kind: "preview" });
    } catch (err: any) {
      const name = err?.name ?? "";
      let message = "Couldn't open the camera. Use the Attach photo button instead.";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        message = "Camera permission denied. Allow camera access in your browser settings and try again.";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        message = "No camera was found on this device. Use the Attach photo button instead.";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        message = "Camera is busy in another app. Close it and try again.";
      }
      setPhase({ kind: "error", message });
    }
  }, []);

  // Attach stream to the <video> element once it exists.
  useEffect(() => {
    if (phase.kind !== "preview") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      // play() returns a promise on most browsers; swallow it so we
      // don't surface an "AbortError" if the user closes the dialog
      // mid-load.
      video.play().catch(() => {});
    }
  }, [phase]);

  // Open dialog → start stream. Close → stop stream + reset.
  useEffect(() => {
    if (open) {
      startStream();
    } else {
      stopStream();
      setPhase({ kind: "idle" });
    }
    // startStream is referentially stable (useCallback with [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Safety net: stop the stream if the component unmounts while the
  // dialog is still open (e.g. route change).
  useEffect(() => stopStream, [stopStream]);

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    // Cap output at 1280×960 — keeps the JPEG under a megabyte even
    // on phones with 4K-capable cameras. Aspect ratio preserved.
    const MAX = 1280;
    const ratio = Math.min(1, MAX / video.videoWidth, MAX / video.videoHeight);
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPhase({ kind: "frozen", dataUrl });
  };

  const useThisPhoto = () => {
    if (phase.kind !== "frozen") return;
    const file = dataUrlToFile(phase.dataUrl, `lead-photo-${Date.now()}.jpg`);
    if (!file) return;
    onCapture(file);
    setOpen(false);
  };

  const retake = () => {
    // Reuses the existing stream — no need to re-prompt for permission.
    setPhase({ kind: "preview" });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Camera className="h-3.5 w-3.5 mr-1.5" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden gap-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base">
              {phase.kind === "frozen" ? "Looks good?" : "Take a photo"}
            </DialogTitle>
          </DialogHeader>

          <div className="relative bg-black aspect-[4/3] flex items-center justify-center">
            {phase.kind === "opening" && (
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            )}
            {phase.kind === "error" && (
              <div className="text-center text-sm text-white/80 px-6 space-y-2">
                <X className="h-6 w-6 mx-auto" />
                <p>{phase.message}</p>
              </div>
            )}
            {phase.kind === "preview" && (
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            )}
            {phase.kind === "frozen" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={phase.dataUrl}
                alt="Captured"
                className="w-full h-full object-cover"
              />
            )}
          </div>

          {/* Action row — minimalist by design. One verb per state. */}
          <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
            {phase.kind === "preview" && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="rounded-full h-14 w-14 p-0 shadow-md"
                  onClick={captureFrame}
                  aria-label="Capture"
                >
                  <Camera className="h-6 w-6" />
                </Button>
                <div className="w-[68px]" /> {/* spacer balances the cancel button */}
              </>
            )}

            {phase.kind === "frozen" && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={retake}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Retake
                </Button>
                <Button type="button" size="sm" onClick={useThisPhoto}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Use this photo
                </Button>
              </>
            )}

            {(phase.kind === "opening" || phase.kind === "error") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                className="ml-auto"
              >
                Close
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Turn a data URL back into a File so it flows through the existing
 * `onPhotoPicked(file)` pipeline. Returns null if the data URL isn't
 * something we can parse — caller already validated by triggering
 * `toDataURL("image/jpeg")` on a real frame, so this is mostly a
 * type-safety guard.
 */
function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  try {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}
