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
import {
  Camera,
  RefreshCcw,
  Loader2,
  AlertTriangle,
  CameraOff,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeDescriptorFromBlobWithTimeout,
  computeLivenessFromBlobs,
  type LivenessResult,
} from "@/lib/face/descriptor";
import { loadFaceModels } from "@/lib/face/models";

interface FaceCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The configured mode at capture time. REQUIRED hides the "Skip" button
  // and any wording that suggests proceeding without a photo.
  mode: "OPTIONAL" | "REQUIRED";
  // When the user confirms a frame, we pass the captured Blob, a face
  // descriptor (128-dim Float32Array, computed in-browser), the number
  // of faces detected, and the liveness check result. Descriptor is
  // non-null only when exactly one face is in frame. faceCount lets
  // the server reject multi-face frames as defense-in-depth.
  // livenessPassed is null when liveness wasn't checked (mode OFF) or
  // when the check failed in a PERMISSIVE-mode way.
  onCapture: (
    blob: Blob,
    descriptor: Float32Array | null,
    faceCount: number,
    livenessPassed: boolean | null,
  ) => Promise<void> | void;
  onSkip?: () => void;
  // Optional context shown at the top of the dialog. Lets the widget say
  // "Check In" vs "Check Out" so the user knows what they're confirming.
  actionLabel: string;
  busy?: boolean;
  // When true (face verification is ENFORCE), the dialog refuses to let
  // the user confirm a frame where no face was detected. When false
  // (verification OFF/WARN), the dialog still computes the descriptor for
  // logging but accepts no-face frames.
  requireFaceDetected?: boolean;
  // Whether to actually run face-api.js after capture. When false (face
  // verification mode is OFF), we skip the descriptor extraction entirely
  // and pass null to onCapture — there's no point spending 2-8s on a
  // fingerprint nobody will check. Saves the UI from freezing on slow
  // devices that fall back to the tfjs CPU backend.
  extractDescriptor?: boolean;
  // When true (faceLivenessMode is PERMISSIVE or STRICT), the dialog
  // captures 3 frames spaced ~500ms apart after the user clicks Capture
  // and runs a motion check across them. A held-up photo or static
  // phone screen produces zero motion and fails the check.
  // `strictLiveness` controls what happens when the motion check itself
  // errors out (face-api timing out, detector missing landmarks):
  //   true  → treat as failure (STRICT mode)
  //   false → treat as pass (PERMISSIVE mode)
  requireLiveness?: boolean;
  strictLiveness?: boolean;
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
  requireFaceDetected = false,
  extractDescriptor = true,
  requireLiveness = false,
  strictLiveness = false,
}: FaceCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  // Face-detection state for the captured frame. We run detection in the
  // background after each capture; the UI shows a small status hint so
  // the user knows if their photo will be accepted before they confirm.
  // `multiple_faces` is the anti-proxy guard — refuses frames where two
  // people stood in front of the camera together.
  const [descriptor, setDescriptor] = useState<Float32Array | null>(null);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [detectStatus, setDetectStatus] = useState<
    "idle"
    | "capturing_frames" // liveness: collecting 3 frames over ~1.5s
    | "analyzing" // single-frame descriptor + count
    | "ok"
    | "no_face"
    | "multiple_faces"
    | "not_live" // liveness check failed (static photo / phone screen)
    | "error"
  >("idle");
  // Liveness check result: passed=true means motion detected (real face),
  // passed=false means static (rejected), passed=null means we couldn't
  // determine (faceLivenessMode=OFF or detector errored in PERMISSIVE).
  const [livenessPassed, setLivenessPassed] = useState<boolean | null>(null);
  const [livenessMotion, setLivenessMotion] = useState<number>(0);

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
      setDescriptor(null);
      setDetectStatus("idle");
      return;
    }
    setCapturedBlob(null);
    setCapturedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDescriptor(null);
    setFaceCount(0);
    setLivenessPassed(null);
    setLivenessMotion(0);
    setDetectStatus("idle");
    startCamera();
    // Pre-warm face-api models in the background while the user is
    // composing their selfie. Idempotent — no-op if already loaded.
    // This turns "first capture takes 5-15s while models download" into
    // "models load during the ~2s the user spends framing the shot."
    loadFaceModels().catch((err) => {
      console.warn("[face-capture] model pre-warm failed:", err);
    });
    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  // Grab a single still frame from the live video as a mirrored JPEG
  // blob. Used both for the final captured photo and (when liveness is
  // on) for the 3-frame motion sequence.
  const grabFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return resolve(null);
      const w = video.videoWidth || TARGET_WIDTH;
      const h = video.videoHeight || TARGET_HEIGHT;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      // Mirror flip — the user expects the captured photo to match what
      // they see on-screen (which is mirrored to feel like a, well, mirror).
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
      canvas.toBlob(
        (blob) => resolve(blob),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  }, []);

  // Run face detection + (optional) descriptor extraction on a single
  // blob, then update local state. Used after a single capture or after
  // the final frame of a liveness sequence.
  const analyzeBlob = useCallback(
    (blob: Blob) => {
      setDetectStatus("analyzing");
      computeDescriptorFromBlobWithTimeout(blob, 30_000, extractDescriptor)
          .then((result) => {
            // If the user has already retaken / closed, the blob ref
            // we capture-by-closure here doesn't match the current
            // state; bail to avoid stomping on the new state.
            setCapturedBlob((current) => {
              if (current !== blob) return current;
              setFaceCount(result.faceCount);
              if (result.faceCount === 0) {
                setDescriptor(null);
                setDetectStatus("no_face");
              } else if (result.faceCount > 1) {
                // Anti-proxy: refuse frames with multiple people. Even
                // if the enrolled user IS in the frame, we don't want
                // a friend / colleague to be able to "tag along."
                setDescriptor(null);
                setDetectStatus("multiple_faces");
              } else {
                // Exactly one face — accept. Descriptor may still be
                // null when extractDescriptor was false (verify mode
                // is OFF, we only counted faces). That's fine; the
                // anti-proxy guard already passed.
                setDescriptor(result.descriptor);
                setDetectStatus("ok");
              }
              return current;
            });
          })
          .catch((err) => {
            console.error("[face-capture] descriptor extraction failed:", err);
            setCapturedBlob((current) => {
              if (current !== blob) return current;
              setDescriptor(null);
              setFaceCount(0);
              setDetectStatus("error");
              return current;
            });
          });
    },
    [extractDescriptor],
  );

  // Main entry point when user clicks Capture. Three flows:
  //   1. Liveness off → grab a single frame, analyze it (existing path).
  //   2. Liveness on → grab 3 frames over ~1s, run motion check on them;
  //      if alive, use the LAST frame as the captured photo and proceed
  //      to analyze it. If not alive, surface the rejection in the UI.
  const handleCapture = useCallback(async () => {
    if (!requireLiveness) {
      const blob = await grabFrame();
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setDescriptor(null);
      setLivenessPassed(null);
      setLivenessMotion(0);
      analyzeBlob(blob);
      return;
    }

    // Liveness sequence: 3 frames, ~500ms apart. Total ~1s of "Hold still"
    // before we show the preview. We deliberately don't show each frame
    // as a preview during the sequence — too noisy. Instead, the spinner
    // + "Checking for movement" line conveys progress.
    setDetectStatus("capturing_frames");
    const frames: Blob[] = [];
    for (let i = 0; i < 3; i++) {
      const f = await grabFrame();
      if (f) frames.push(f);
      if (i < 2) await new Promise((r) => setTimeout(r, 500));
    }
    if (frames.length < 2) {
      // Couldn't even grab two frames — camera glitch. Treat as error.
      setDetectStatus("error");
      return;
    }
    const finalFrame = frames[frames.length - 1];
    setCapturedBlob(finalFrame);
    setCapturedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(finalFrame);
    });

    let liveness: LivenessResult;
    try {
      liveness = await computeLivenessFromBlobs(frames);
    } catch (err) {
      console.error("[face-capture] liveness check threw:", err);
      liveness = { passed: null, motion: 0, frames: 0 };
    }
    setLivenessMotion(liveness.motion);

    // Decide pass/fail with the strictness policy.
    //   passed=true  → alive, proceed
    //   passed=false → static photo / phone screen, reject
    //   passed=null  → detector errored. STRICT rejects, PERMISSIVE allows
    let effectivePassed: boolean;
    if (liveness.passed === true) {
      effectivePassed = true;
    } else if (liveness.passed === false) {
      effectivePassed = false;
    } else {
      effectivePassed = !strictLiveness; // PERMISSIVE = allow on null
    }
    setLivenessPassed(effectivePassed);

    if (!effectivePassed) {
      // Liveness failed — don't even bother computing the descriptor;
      // the user has to retake. Confirm button stays disabled.
      setDescriptor(null);
      setFaceCount(0);
      setDetectStatus("not_live");
      return;
    }

    // Alive — proceed with the normal single-frame analysis on the last
    // (most recent) frame. The same anti-proxy / descriptor logic runs.
    analyzeBlob(finalFrame);
  }, [requireLiveness, strictLiveness, grabFrame, analyzeBlob]);

  const handleConfirm = useCallback(async () => {
    if (!capturedBlob) return;
    // When ENFORCE mode is on upstream and we didn't get a clean
    // single-face frame, refuse here so the bad photo never even
    // hits the upload endpoint. (multiple_faces also has descriptor=null
    // so this catches both 0-face and 2+-face cases.)
    if (requireFaceDetected && !descriptor) return;
    // Liveness check failed → refuse confirm. The disabled state on the
    // button already prevents this in the UI, but guard server-bound
    // calls defensively.
    if (detectStatus === "not_live") return;
    await onCapture(capturedBlob, descriptor, faceCount, livenessPassed);
  }, [
    capturedBlob,
    descriptor,
    faceCount,
    livenessPassed,
    detectStatus,
    onCapture,
    requireFaceDetected,
  ]);

  const handleRetake = useCallback(() => {
    setCapturedBlob(null);
    setCapturedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDescriptor(null);
    setFaceCount(0);
    setLivenessPassed(null);
    setLivenessMotion(0);
    setDetectStatus("idle");
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

        {detectStatus === "capturing_frames" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Hold still for a moment — checking liveness…
          </div>
        )}
        {capturedBlob && detectStatus === "analyzing" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking your face…
          </div>
        )}
        {capturedBlob && detectStatus === "not_live" && (
          <div className="flex items-start gap-1.5 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            No movement detected — this looks like a held-up photo or a
            still screen. Real selfies have natural micro-motion. Please
            retake while looking at the camera.
          </div>
        )}
        {capturedBlob && detectStatus === "ok" && (
          <div className="flex items-center gap-1.5 text-xs text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Face detected.
          </div>
        )}
        {capturedBlob && detectStatus === "no_face" && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {requireFaceDetected
              ? "No face detected — please retake (look at the camera, face fully in frame)."
              : "No face detected. You can still proceed since verification is off."}
          </div>
        )}
        {capturedBlob && detectStatus === "multiple_faces" && (
          <div className="flex items-start gap-1.5 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {faceCount} faces detected. Only the enrolled user can be in
            the frame — ask others to step aside and retake.
          </div>
        )}
        {capturedBlob && detectStatus === "error" && (
          <div className="flex items-start gap-1.5 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            Couldn't analyze the photo. Retake or try again.
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
          <div className="flex gap-2 justify-end">
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
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={
                    busy ||
                    detectStatus === "analyzing" ||
                    detectStatus === "capturing_frames" ||
                    // Always block multi-face frames — the anti-proxy
                    // guard runs regardless of verification mode. The
                    // user must retake with only themselves in frame.
                    detectStatus === "multiple_faces" ||
                    // Liveness failure — held-up photo / static screen.
                    detectStatus === "not_live" ||
                    (requireFaceDetected && detectStatus !== "ok")
                  }
                >
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
                disabled={
                  busy ||
                  !!error ||
                  starting ||
                  detectStatus === "capturing_frames"
                }
              >
                {detectStatus === "capturing_frames" ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-1.5" />
                )}
                {detectStatus === "capturing_frames" ? "Capturing…" : "Capture"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
