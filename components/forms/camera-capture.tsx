"use client"

import type React from "react"
import { useState, useRef, useEffect, useLayoutEffect } from "react"
import { Button } from "@/components/ui/button"
import { Camera, X, RotateCcw, ImageIcon, Loader2 } from "lucide-react"
import { useUploadFileMutation } from "@/lib/api/upload"

interface CameraCaptureProps {
  onCapture: (imageData: string) => void
  capturedImage: string | null
  onClear: () => void
}

export default function CameraCapture({ onCapture, capturedImage, onClear }: CameraCaptureProps) {
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingRetake, setPendingRetake] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadFile] = useUploadFileMutation()

  const updateStream = (nextStream: MediaStream | null) => {
    streamRef.current = nextStream
    setStream(nextStream)
  }

  // Open camera with live preview
  const openCamera = async () => {
    console.log("[CameraCapture] Attempting to open camera...");
    setError(null);
    setIsCameraOpen(true); // Set early to show video element

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      updateStream(null);
    }

    // Check MediaDevices API support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[CameraCapture] MediaDevices API not supported");
      setError("Camera not supported on this device. Please use file upload.");
      setIsCameraOpen(false);
      fileInputRef.current?.click();
      return;
    }

    try {
      // Try accessing camera (no specific facingMode to maximize compatibility)
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 }, // Reduced resolution for broader compatibility
          height: { ideal: 720 },
        },
        audio: false,
      });

      console.log("[CameraCapture] Camera access granted");
      updateStream(mediaStream);
    } catch (err) {
      console.error("[CameraCapture] Camera access error:", err);
      let errorMessage = "Unable to access camera. Please use file upload.";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          errorMessage = "Camera permission denied. Please allow camera access in browser settings.";
        } else if (err.name === "NotFoundError") {
          errorMessage = "No camera found on this device. Please use file upload.";
        } else if (err.name === "NotReadableError") {
          errorMessage = "Camera is in use by another application.";
        }
      }
      setError(errorMessage);
      setIsCameraOpen(false);
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 1000);
    }
  }

  // Close camera and stop stream
  const closeCamera = () => {
    console.log("[CameraCapture] Closing camera...");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      updateStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setError(null);
  }

  // Capture photo from video stream
  const capturePhoto = async () => {
    console.log("[CameraCapture] Capturing photo...");
    if (!videoRef.current || !canvasRef.current) {
      console.error("[CameraCapture] Video or canvas ref missing");
      setError("Cannot capture photo. Please try again.");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            console.error("[CameraCapture] Failed to create blob");
            setError("Failed to capture image. Please try again.");
            return;
          }

          console.log("[CameraCapture] Photo captured, uploading...");
          setIsUploading(true);
          closeCamera();

          try {
            const formData = new FormData();
            formData.append("image", blob, `camera_${Date.now()}.jpg`);
            formData.append("type", "camera");

            const result = await uploadFile(formData).unwrap();
            console.log("[CameraCapture] Upload successful:", result.imageUrl);
            onCapture(result.imageUrl!);
          } catch (err) {
            console.error("[CameraCapture] Upload error:", err);
            setError("Failed to upload image. Please try again.");
          } finally {
            setIsUploading(false);
          }
        },
        "image/jpeg",
        0.9,
      );
    } else {
      console.error("[CameraCapture] Canvas context not available");
      setError("Failed to capture image. Please try again.");
    }
  }

  // Retake flow must clear the parent image before opening the camera again.
  const handleRetake = () => {
    setPendingRetake(true)
    onClear()
  }

  // Handle file input fallback
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log("[CameraCapture] File selected, uploading...");
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("type", "gallery");

        const result = await uploadFile(formData).unwrap();
        console.log("[CameraCapture] Upload successful:", result.imageUrl);
        onCapture(result.imageUrl!);
      } catch (err) {
        console.error("[CameraCapture] Upload error:", err);
        setError("Failed to upload image. Please try again.");
      } finally {
        setIsUploading(false);
      }
    }
  }

  useLayoutEffect(() => {
    if (!stream || !isCameraOpen) return;
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    const handleLoadedMetadata = () => {
      console.log("[CameraCapture] Video metadata loaded, attempting to play...");
      video.play().catch((playErr) => {
        console.error("[CameraCapture] Video playback error:", playErr);
        setError("Failed to start camera stream. Please try again.");
        setIsCameraOpen(false);
      });
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [stream, isCameraOpen]);

  useEffect(() => {
    if (!pendingRetake) return
    if (capturedImage) return

    setPendingRetake(false)
    openCamera()
  }, [pendingRetake, capturedImage])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[CameraCapture] Cleaning up stream on unmount...");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Uploading state — inline in the input bar
  if (isUploading) {
    return (
      <div className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-sm">
        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
        <span className="ml-2 text-muted-foreground truncate">Uploading...</span>
      </div>
    );
  }

  // Captured image — single-line input with inline thumbnail
  if (capturedImage && !isCameraOpen && !pendingRetake) {
    return (
      <div className="space-y-1.5">
        <div className="flex h-8 w-full items-center rounded-md border border-input bg-background text-sm">
          <img
            src={capturedImage || "/placeholder.svg"}
            alt="Captured"
            className="h-6 w-6 rounded object-cover ml-1 shrink-0"
          />
          <span className="flex-1 px-2 text-foreground text-sm truncate">Photo captured</span>
          <div className="flex items-center shrink-0 border-l border-input">
            <button
              type="button"
              onClick={handleRetake}
              className="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-primary transition-colors"
              title="Retake"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClear}
              className="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-destructive transition-colors rounded-r-md"
              title="Remove"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Camera live view — opens below the input
  if (isCameraOpen || stream) {
    return (
      <div className="space-y-1.5">
        <div className="relative overflow-hidden bg-black rounded-md border border-input">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-44 object-cover bg-black"
            style={{ display: "block" }}
          />
          <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-2 px-3">
            <Button
              type="button"
              onClick={closeCamera}
              size="sm"
              variant="secondary"
              className="h-7 rounded-full text-xs px-3"
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
            <Button
              type="button"
              onClick={capturePhoto}
              size="sm"
              className="h-7 rounded-full text-xs px-3"
            >
              <Camera className="w-3 h-3 mr-1" />
              Capture
            </Button>
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // Default state — single-line input matching other form fields
  return (
    <div className="space-y-1.5">
      {error && (
        <div className="px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive">{error}</div>
      )}

      <div className="flex h-8 w-full items-center rounded-md border border-input bg-background text-sm transition-colors hover:border-muted-foreground/40">
        <div className="flex items-center pl-3">
          <Camera className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
        <span className="flex-1 px-2 text-muted-foreground truncate">
          Capture photo or upload image
        </span>
        <div className="flex items-center shrink-0 border-l border-input">
          <button
            type="button"
            onClick={() => {
              console.log("[CameraCapture] Upload button clicked");
              fileInputRef.current?.click();
            }}
            className="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-primary transition-colors"
            title="Upload image"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              console.log("[CameraCapture] Camera button clicked");
              openCamera();
            }}
            className="flex items-center justify-center h-full px-2.5 text-muted-foreground hover:text-primary transition-colors rounded-r-md"
            title="Open camera"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}