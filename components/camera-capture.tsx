"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Camera, X, RotateCcw, ImageIcon, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"

interface CameraCaptureProps {
  onCapture: (imageData: string) => void
  capturedImage: string | null
  onClear: () => void
}

export default function CameraCapture({ onCapture, capturedImage, onClear }: CameraCaptureProps) {
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Open camera with live preview
  const openCamera = async () => {
    console.log("[CameraCapture] Attempting to open camera...");
    setError(null);
    setIsCameraOpen(true); // Set early to show video element

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
      setStream(mediaStream);

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          console.log("[CameraCapture] Video metadata loaded, attempting to play...");
          videoRef.current?.play().catch((playErr) => {
            console.error("[CameraCapture] Video playback error:", playErr);
            setError("Failed to start camera stream. Please try again.");
            setIsCameraOpen(false);
          });
        };
      } else {
        console.error("[CameraCapture] Video ref not available");
        setError("Failed to initialize camera. Please try again.");
        setIsCameraOpen(false);
      }
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
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
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

            const response = await fetch("/api/upload", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              throw new Error("Upload failed");
            }

            const { imageUrl } = await response.json();
            console.log("[CameraCapture] Upload successful:", imageUrl);
            onCapture(imageUrl);
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

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const { imageUrl } = await response.json();
        console.log("[CameraCapture] Upload successful:", imageUrl);
        onCapture(imageUrl);
      } catch (err) {
        console.error("[CameraCapture] Upload error:", err);
        setError("Failed to upload image. Please try again.");
      } finally {
        setIsUploading(false);
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[CameraCapture] Cleaning up stream on unmount...");
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  if (isUploading) {
    return (
      <div className="space-y-2">
        <Card className="p-8 flex flex-col items-center justify-center border border-gray-200 rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
          <p className="text-sm text-gray-500">Uploading to cloud...</p>
        </Card>
      </div>
    );
  }

  if (capturedImage) {
    return (
      <div className="space-y-2">
        <Card className="relative overflow-hidden border border-gray-200 rounded-lg">
          <img src={capturedImage || "/placeholder.svg"} alt="Captured" className="w-full h-48 object-cover" />
          <Button
            type="button"
            onClick={onClear}
            size="icon"
            variant="destructive"
            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-red-500 hover:bg-red-600"
          >
            <X className="w-4 h-4" />
          </Button>
        </Card>
        <Button
          type="button"
          onClick={openCamera}
          size="sm"
          className="w-full bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Retake
        </Button>
      </div>
    );
  }

  if (isCameraOpen) {
    return (
      <div className="space-y-2">
        <Card className="relative overflow-hidden bg-black rounded-lg">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-64 object-cover bg-black"
            style={{ display: "block" }}
          />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
            <Button
              type="button"
              onClick={closeCamera}
              size="sm"
              variant="secondary"
              className="rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              type="button"
              onClick={capturePhoto}
              size="sm"
              className="rounded-full bg-blue-500 text-white hover:bg-blue-600"
            >
              <Camera className="w-4 h-4 mr-2" />
              Capture
            </Button>
          </div>
        </Card>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // Initial state - aesthetic input field with buttons
  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center border border-gray-200 rounded-lg bg-white shadow-sm">
        <Button
          type="button"
          onClick={() => {
            console.log("[CameraCapture] Upload button clicked");
            fileInputRef.current?.click();
          }}
          size="sm"
          variant="ghost"
          className="h-10 px-4 rounded-l-lg hover:bg-gray-100"
        >
          <ImageIcon className="w-5 h-5 text-gray-500" />
        </Button>
        <input
          type="text"
          placeholder="Upload an image or use camera"
          className="flex-1 h-10 bg-transparent outline-none text-gray-600 text-sm px-3"
          readOnly
        />
        <Button
          type="button"
          onClick={() => {
            console.log("[CameraCapture] Camera button clicked");
            openCamera();
          }}
          size="sm"
          variant="ghost"
          className="h-10 px-4 rounded-r-lg hover:bg-gray-100"
        >
          <Camera className="w-5 h-5 text-gray-500" />
        </Button>
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