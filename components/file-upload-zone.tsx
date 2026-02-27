"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, CheckCircle, AlertCircle, Play, FileIcon, Loader2, ImageIcon, VideoIcon } from 'lucide-react';
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

  const getFileType = (file: File) => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    return "file";
  };

  const handleFile = async (file: File) => {
    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSize) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${maxSize}MB. Your file is ${fileSizeMB.toFixed(1)}MB.`,
        variant: "destructive",
      });
      return;
    }

    // Validate file type for specific field types
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
          console.log("[v0] Upload response:", response);

          // Your API returns { imageUrl }, not { success, url }
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
          throw new Error("Upload failed with status " + xhr.status);
        }
      });

      xhr.addEventListener("error", () => {
        throw new Error("Network error during upload");
      });

      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    } catch (error: any) {
      console.error("[v0] Upload error:", error);
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
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0 && !disabled && !isUploading) {
      handleFile(e.target.files[0]);
    }
  };

  const renderPreview = () => {
    if (!currentValue) return null;

    const fileType = getFileType(new File([], currentValue));

    return (
      <div className="relative rounded-lg overflow-hidden border-2 border-dashed border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100">
        {fileType === "image" || fieldType === "image" ? (
          <div className="relative">
            <img
              src={currentValue || "/placeholder.svg"}
              alt="Preview"
              className="w-full h-auto max-h-64 object-contain"
              crossOrigin="anonymous"
            />
          </div>
        ) : fileType === "video" || fieldType === "video" ? (
          <div className="relative aspect-video bg-black flex items-center justify-center">
            <video
              src={currentValue}
              className="w-full h-full object-contain"
              controls
              crossOrigin="anonymous"
            />
          </div>
        ) : (
          <div className="p-6 flex flex-col items-center justify-center bg-white">
            <FileIcon className="h-12 w-12 text-blue-500 mb-2" />
            <p className="text-sm text-gray-600 text-center">
              {currentValue.split("/").pop()}
            </p>
          </div>
        )}

        {/* Clear button */}
        <button
          onClick={() => {
            onClear?.();
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          disabled={disabled}
          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white p-1 rounded-full shadow-lg transition-all"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Success checkmark */}
        <div className="absolute top-2 left-2 bg-green-500 text-white p-1 rounded-full">
          <CheckCircle className="h-4 w-4" />
        </div>
      </div>
    );
  };

  const renderUploadZone = () => {
    if (isUploading) {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
          <p className="text-sm text-gray-600 text-center font-medium">
            Uploading to Hostinger...
          </p>
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-gray-500 text-center">
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
          "border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 cursor-pointer",
          isDragging
            ? "border-blue-500 bg-blue-50 scale-105"
            : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <div className="flex justify-center mb-3">
          {fieldType === "image" && (
            <ImageIcon className="h-8 w-8 text-blue-500" />
          )}
          {fieldType === "video" && <VideoIcon className="h-8 w-8 text-blue-500" />}
          {(fieldType === "file" || fieldType === "signature") && (
            <Upload className="h-8 w-8 text-blue-500" />
          )}
        </div>

        <p className="font-semibold text-gray-900 mb-1">
          Drop file here or click to browse
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Uploads to Hostinger • Max {maxSize}MB
        </p>

        <Button
          type="button"
          onClick={(e) => {
            e.preventDefault();      // Extra safety
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={disabled || isUploading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Upload className="h-4 w-4 mr-2" />
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
    <div className="space-y-4">
      {currentValue ? renderPreview() : renderUploadZone()}
    </div>
  );
}
