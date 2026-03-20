"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  X,
  CheckCircle,
  Play,
  FileIcon,
  Loader2,
  ImageIcon,
  VideoIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  fieldType: "image" | "file" | "signature" | "video";
  onUploadComplete: (url: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  currentValue?: string;
  maxSize?: number; // in MB
}

export function FileUploadZone({
  fieldType,
  onUploadComplete,
  onClear,
  disabled = false,
  currentValue,
  maxSize = 10,
}: FileUploadZoneProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (isPreviewOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isPreviewOpen]);

  const getAcceptTypes = () => {
    switch (fieldType) {
      case "image":
        return "image/*";
      case "video":
        return "video/*";
      case "signature":
        return "image/png,image/jpeg";
      case "file":
        return "*";
      default:
        return "image/*";
    }
  };

  const getFileTypeFromUrl = (url?: string) => {
    if (!url) return "file";
    const path = url.split("?")[0].toLowerCase();
    if (path.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return "image";
    if (path.match(/\.(mp4|webm|ogg|mov|mkv)$/)) return "video";
    if (path.match(/\.(pdf)$/)) return "pdf";
    return "file";
  };

  const handleFile = async (file: File) => {
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSize) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${maxSize}MB. Your file is ${fileSizeMB.toFixed(1)}MB.`,
        variant: "destructive",
      });
      return;
    }

    if (fieldType === "image" && !file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    if (fieldType === "video" && !file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file.",
        variant: "destructive",
      });
      return;
    }

    if (fieldType === "signature" && !["image/png", "image/jpeg"].includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Signature must be PNG or JPEG.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("type", fieldType);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(percentComplete);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          if (response.imageUrl) {
            onUploadComplete(response.imageUrl);
            toast({
              title: "Success",
              description: "File uploaded successfully!",
            });
          } else {
            throw new Error(response.error || "No imageUrl in response");
          }
        } else {
          throw new Error(`Upload failed with status ${xhr.status}`);
        }
      });

      xhr.addEventListener("error", () => {
        throw new Error("Network error during upload");
      });

      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0 && !disabled && !isUploading) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && !disabled && !isUploading) {
      handleFile(e.target.files[0]);
    }
  };

  const renderPreview = () => {
    if (!currentValue) return null;

    const fileType = getFileTypeFromUrl(currentValue);
    const isImage = fileType === "image" || fieldType === "image";
    const isVideo = fileType === "video" || fieldType === "video";

    return (
      <div className="relative rounded-lg overflow-hidden border-2 border-dashed border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100">
        {/* Clickable preview area */}
        <div
          className="cursor-pointer"
          onClick={() => setIsPreviewOpen(true)}
        >
          {isImage ? (
            <img
              src={currentValue}
              alt="Preview"
              className="w-full h-auto max-h-64 object-contain"
            />
          ) : isVideo ? (
            <div className="relative aspect-video bg-black">
              <video
                src={currentValue}
                className="w-full h-full object-contain"
                muted
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-20 w-20 text-white opacity-80" />
              </div>
            </div>
          ) : (
            <div className="p-10 flex flex-col items-center justify-center bg-white min-h-[200px]">
              <FileIcon className="h-16 w-16 text-blue-500 mb-4" />
              <p className="text-sm text-gray-700 font-medium text-center break-all px-4">
                {currentValue.split("/").pop() || "Uploaded file"}
              </p>
            </div>
          )}
        </div>

        {/* Clear button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear?.();
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          disabled={disabled}
          className="absolute top-3 right-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white p-2 rounded-full shadow-lg transition-all z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Success indicator */}
        <div className="absolute top-3 left-3 bg-green-600 text-white p-2 rounded-full shadow z-10">
          <CheckCircle className="h-5 w-5" />
        </div>
      </div>
    );
  };

  const renderUploadZone = () => {
    if (isUploading) {
      return (
        <div className="space-y-4 py-10">
          <div className="flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
          </div>
          <p className="text-base text-gray-700 text-center font-medium">
            Uploading...
          </p>
          <Progress value={uploadProgress} className="h-2.5 max-w-xs mx-auto" />
          <p className="text-sm text-gray-500 text-center">
            {uploadProgress.toFixed(0)}%
          </p>
        </div>
      );
    }

    return (
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 cursor-pointer",
          isDragging
            ? "border-blue-500 bg-blue-50 scale-[1.02] shadow-lg"
            : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        <div className="flex justify-center mb-4">
          {fieldType === "image" && <ImageIcon className="h-10 w-10 text-blue-500" />}
          {fieldType === "video" && <VideoIcon className="h-10 w-10 text-blue-500" />}
          {(fieldType === "file" || fieldType === "signature") && (
            <Upload className="h-10 w-10 text-blue-500" />
          )}
        </div>

        <p className="font-semibold text-gray-900 text-lg mb-2">
          Drop your file here or click to browse
        </p>
        <p className="text-sm text-gray-600 mb-6">
          Max size: {maxSize}MB • Uploaded to Hostinger
        </p>

        <Button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={disabled || isUploading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-5 text-base"
        >
          <Upload className="h-5 w-5 mr-2" />
          Select {fieldType === "image" ? "Image" : fieldType === "video" ? "Video" : "File"}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptTypes()}
          onChange={handleFileSelect}
          disabled={disabled}
          className="hidden"
        />
      </div>
    );
  };

  return (
    <>
      <div className="space-y-5">
        {currentValue ? renderPreview() : renderUploadZone()}
      </div>

      {/* Lightbox / Popup */}
      {isPreviewOpen && currentValue && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="relative max-w-[96vw] max-h-[96vh] mx-3 sm:mx-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsPreviewOpen(false)}
              className="absolute -top-14 right-0 sm:-top-16 sm:-right-4 bg-white/95 hover:bg-white text-gray-900 rounded-full p-3 shadow-2xl transition-all z-20"
              aria-label="Close preview"
            >
              <X className="h-7 w-7" />
            </button>

            {getFileTypeFromUrl(currentValue) === "image" || fieldType === "image" ? (
              <img
                src={currentValue}
                alt="Full size preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            ) : getFileTypeFromUrl(currentValue) === "video" || fieldType === "video" ? (
              <video
                src={currentValue}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
              />
            ) : (
              <div className="bg-white rounded-xl p-10 max-w-lg text-center">
                <FileIcon className="h-16 w-16 text-blue-500 mx-auto mb-6" />
                <h3 className="text-xl font-semibold mb-3">Preview not supported</h3>
                <p className="text-gray-600 mb-6">
                  This file type cannot be previewed directly in the browser.
                </p>
                <a
                  href={currentValue}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition"
                >
                  Open file in new tab
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}