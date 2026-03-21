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
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  fieldType: "image" | "file" | "signature" | "video";
  onUploadComplete: (url: string | string[]) => void;
  onClear?: (url?: string) => void;
  disabled?: boolean;
  currentValue?: string | string[];
  maxSize?: number; // in MB
  allowMultiple?: boolean;
}

export function FileUploadZone({
  fieldType,
  onUploadComplete,
  onClear,
  disabled = false,
  currentValue,
  maxSize = 10,
  allowMultiple = true,
}: FileUploadZoneProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);

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

  const uploadFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
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
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.imageUrl) {
              resolve(response.imageUrl);
            } else {
              reject(new Error(response.error || "No imageUrl in response"));
            }
          } catch (e) {
            reject(new Error("Failed to parse response"));
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error during upload"));
      });

      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    const validFiles: File[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileSizeMB = file.size / (1024 * 1024);

      if (fileSizeMB > maxSize) {
        toast({
          title: "File too large",
          description: `${file.name} is too large. Maximum size is ${maxSize}MB.`,
          variant: "destructive",
        });
        continue;
      }

      if (fieldType === "image" && !file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not an image.`,
          variant: "destructive",
        });
        continue;
      }

      if (fieldType === "video" && !file.type.startsWith("video/")) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a video.`,
          variant: "destructive",
        });
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const uploadedUrls: string[] = [];
    const currentList = Array.isArray(currentValue) ? [...currentValue] : currentValue ? [currentValue] : [];

    try {
      for (let i = 0; i < validFiles.length; i++) {
        // Update progress context if multiple
        const url = await uploadFile(validFiles[i]);
        uploadedUrls.push(url);
        
        if (!allowMultiple) {
          onUploadComplete(url);
          break; // Only one if not multiple
        }
      }

      if (allowMultiple && uploadedUrls.length > 0) {
        onUploadComplete([...currentList, ...uploadedUrls]);
      }
      
      toast({
        title: "Success",
        description: `${uploadedUrls.length} file(s) uploaded successfully!`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file(s)",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && !disabled && !isUploading) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (urlToRemove: string) => {
    if (Array.isArray(currentValue)) {
      onUploadComplete(currentValue.filter(url => url !== urlToRemove));
    } else {
      onClear?.();
    }
  };

  const renderSinglePreview = (url: string, index: number) => {
    const fileType = getFileTypeFromUrl(url);
    const isImage = fileType === "image" || fieldType === "image";
    const isVideo = fileType === "video" || fieldType === "video";

    return (
      <div key={`${url}-${index}`} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex flex-col items-center justify-center min-h-[150px]">
        {/* Clickable preview area */}
        <div
          className="cursor-pointer w-full h-full flex items-center justify-center"
          onClick={() => {
            setSelectedPreviewUrl(url);
            setIsPreviewOpen(true);
          }}
        >
          {isImage ? (
            <img
              src={url}
              alt={`Preview ${index}`}
              className="w-full h-full object-cover aspect-square hover:scale-105 transition-transform duration-300"
            />
          ) : isVideo ? (
            <div className="relative w-full h-full aspect-square bg-black">
              <video
                src={url}
                className="w-full h-full object-cover"
                muted
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                <Play className="h-10 w-10 text-white opacity-80" />
              </div>
            </div>
          ) : (
            <div className="p-4 flex flex-col items-center justify-center w-full h-full">
              <FileIcon className="h-10 w-10 text-blue-500 mb-2" />
              <p className="text-[10px] text-gray-500 font-medium text-center break-all line-clamp-2 px-2">
                {url.split("/").pop() || "File"}
              </p>
            </div>
          )}
        </div>

        {/* Action Overlay */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeFile(url);
            }}
            disabled={disabled}
            className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-md transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Success indicator */}
        <div className="absolute top-1 left-1 bg-green-500 text-white p-1 rounded-full shadow-sm z-10 pointer-events-none">
          <CheckCircle className="h-3 w-3" />
        </div>
      </div>
    );
  };

  const renderPreviews = () => {
    if (!currentValue) return null;
    
    const urls = Array.isArray(currentValue) ? currentValue : [currentValue];
    if (urls.length === 0) return null;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
        {urls.map((url, idx) => renderSinglePreview(url, idx))}
        
        {allowMultiple && !disabled && !isUploading && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center aspect-square cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group"
          >
            <Plus className="h-8 w-8 text-gray-400 group-hover:text-blue-500 mb-1" />
            <span className="text-xs text-gray-500 group-hover:text-blue-600">Add More</span>
          </div>
        )}
      </div>
    );
  };

  const renderUploadZone = () => {
    if (isUploading) {
      return (
        <div className="space-y-4 py-8 bg-gray-50 rounded-xl border-2 border-dashed border-blue-200">
          <div className="flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
          </div>
          <p className="text-sm text-gray-700 text-center font-medium">
            Uploading files...
          </p>
          <div className="max-w-xs mx-auto space-y-2">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-[10px] text-gray-500 text-center">
              Current file: {uploadProgress.toFixed(0)}%
            </p>
          </div>
        </div>
      );
    }

    // If not multiple and has value, don't show zone (preview handles it)
    if (!allowMultiple && currentValue) return null;

    // If multiple and has values, show smaller upload zone or just the "Add More" in grid
    // For now, if we have values, the "Add More" box in the grid is enough, but a small drop zone might be nice.
    const hasValues = Array.isArray(currentValue) ? currentValue.length > 0 : !!currentValue;
    
    if (hasValues && allowMultiple) {
      return (
         <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer mt-4",
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/20",
            disabled && "opacity-50 cursor-not-allowed pointer-events-none"
          )}
        >
          <p className="text-sm text-gray-500">
            <span className="font-medium text-blue-600">Drop more files</span> or click to upload
          </p>
        </div>
      );
    }

    return (
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 cursor-pointer",
          isDragging
            ? "border-blue-500 bg-blue-50 scale-[1.01] shadow-md"
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

        <p className="font-bold text-gray-900 text-lg mb-1">
          {allowMultiple ? "Upload many photos" : "Upload a photo"}
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Drag and drop here or click to browse
        </p>

        <Button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={disabled || isUploading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12"
        >
          <Upload className="h-5 w-5 mr-2" />
          Select {allowMultiple ? "Files" : (fieldType === "image" ? "Image" : fieldType === "video" ? "Video" : "File")}
        </Button>

        <p className="text-[11px] text-gray-400 mt-4 uppercase tracking-wider font-semibold">
          Max size: {maxSize}MB • Supported: {getAcceptTypes()}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptTypes()}
          onChange={handleFileSelect}
          multiple={allowMultiple}
          disabled={disabled}
          className="hidden"
        />
      </div>
    );
  };

  return (
    <>
      <div className="w-full">
        {renderPreviews()}
        {renderUploadZone()}
        
        {/* Hidden input for multiple uploads if not already shown */}
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptTypes()}
          onChange={handleFileSelect}
          multiple={allowMultiple}
          disabled={disabled}
          className="hidden"
        />
      </div>

      {/* Lightbox / Popup */}
      {isPreviewOpen && selectedPreviewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="relative max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsPreviewOpen(false)}
              className="absolute -top-12 right-0 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-all"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>

            {getFileTypeFromUrl(selectedPreviewUrl) === "image" || fieldType === "image" ? (
              <img
                src={selectedPreviewUrl}
                alt="Full size preview"
                className="max-w-[95vw] max-h-[85vh] object-contain rounded shadow-2xl"
              />
            ) : getFileTypeFromUrl(selectedPreviewUrl) === "video" || fieldType === "video" ? (
              <video
                src={selectedPreviewUrl}
                controls
                autoPlay
                className="max-w-[95vw] max-h-[85vh] object-contain rounded shadow-2xl"
              />
            ) : (
              <div className="bg-white rounded-xl p-10 max-w-lg text-center shadow-2xl">
                <FileIcon className="h-16 w-16 text-blue-500 mx-auto mb-6" />
                <h3 className="text-xl font-semibold mb-3">Preview not supported</h3>
                <a
                  href={selectedPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition"
                >
                  Download File
                </a>
              </div>
            )}
            
            <p className="text-white/60 text-center mt-4 text-xs break-all px-10">
              {selectedPreviewUrl}
            </p>
          </div>
        </div>
      )}
    </>
  );
}