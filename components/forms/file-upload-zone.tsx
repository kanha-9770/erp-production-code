"use client";

import { useState, useRef, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  X,
  Play,
  FileIcon,
  Loader2,
  ImageIcon,
  VideoIcon,
  Paperclip,
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
        return "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.ppt,.pptx";
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

  const getFileName = (url: string) => {
    const name = url.split("/").pop()?.split("?")[0] || "file";
    return name.length > 25 ? name.substring(0, 22) + "..." : name;
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
        const url = await uploadFile(validFiles[i]);
        uploadedUrls.push(url);

        if (!allowMultiple) {
          onUploadComplete(url);
          break;
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
      onUploadComplete(currentValue.filter((url) => url !== urlToRemove));
    } else {
      onClear?.();
    }
  };

  const urls = Array.isArray(currentValue)
    ? currentValue
    : currentValue
      ? [currentValue]
      : [];
  const hasFiles = urls.length > 0;

  const fieldTypeIcon = () => {
    switch (fieldType) {
      case "image":
        return <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />;
      case "video":
        return <VideoIcon className="h-4 w-4 text-muted-foreground shrink-0" />;
      default:
        return <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  const placeholderText = () => {
    if (isUploading) return "Uploading...";
    if (!hasFiles) {
      switch (fieldType) {
        case "image":
          return allowMultiple ? "Choose images..." : "Choose an image...";
        case "video":
          return "Choose a video...";
        case "signature":
          return "Upload signature...";
        default:
          return allowMultiple ? "Choose files..." : "Choose a file...";
      }
    }
    const count = urls.length;
    return `${count} file${count > 1 ? "s" : ""} selected`;
  };

  return (
    <>
      <div className="w-full space-y-2">
        {/* Single-line input bar — matches Input component style */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={cn(
            "flex h-8 w-full items-center rounded-md border bg-background text-sm transition-colors",
            isDragging
              ? "border-primary ring-2 ring-primary/20"
              : "border-input",
            disabled && "opacity-50 cursor-not-allowed",
            !disabled && "hover:border-muted-foreground/40"
          )}
        >
          {/* Left icon */}
          <div className="flex items-center pl-3">
            {isUploading ? (
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
            ) : (
              fieldTypeIcon()
            )}
          </div>

          {/* Text area — clickable */}
          <button
            type="button"
            onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            className={cn(
              "flex-1 h-full px-2 text-left truncate bg-transparent outline-none",
              hasFiles ? "text-foreground" : "text-muted-foreground",
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            )}
          >
            {placeholderText()}
          </button>

          {/* Upload progress inline */}
          {isUploading && (
            <div className="flex items-center gap-2 pr-2 shrink-0">
              <Progress value={uploadProgress} className="h-1 w-16" />
              <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                {uploadProgress.toFixed(0)}%
              </span>
            </div>
          )}

          {/* Right action buttons */}
          {!isUploading && (
            <div className="flex items-center shrink-0 border-l border-input">
              {hasFiles && allowMultiple && !disabled && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-primary transition-colors"
                  title="Add more files"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => !disabled && fileInputRef.current?.click()}
                disabled={disabled}
                className={cn(
                  "flex items-center justify-center h-full px-2.5 text-muted-foreground transition-colors rounded-r-md",
                  disabled ? "cursor-not-allowed" : "hover:text-primary hover:bg-muted/50"
                )}
                title="Browse files"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Compact preview strip — only when files exist */}
        {hasFiles && (
          <div className="flex flex-wrap gap-1.5">
            {urls.map((url, idx) => {
              const fileType = getFileTypeFromUrl(url);
              const isImage = fileType === "image" || fieldType === "image";
              const isVideo = fileType === "video" || fieldType === "video";

              return (
                <div
                  key={`${url}-${idx}`}
                  className="group relative inline-flex items-center gap-1.5 h-7 pl-1 pr-1.5 rounded-md border bg-muted/40 text-xs max-w-[180px] hover:bg-muted/60 transition-colors"
                >
                  {/* Thumbnail or icon */}
                  {isImage ? (
                    <img
                      src={url}
                      alt={`File ${idx + 1}`}
                      className="h-5 w-5 rounded object-cover shrink-0 cursor-pointer"
                      onClick={() => {
                        setSelectedPreviewUrl(url);
                        setIsPreviewOpen(true);
                      }}
                    />
                  ) : isVideo ? (
                    <div
                      className="relative h-5 w-5 rounded bg-black shrink-0 cursor-pointer flex items-center justify-center"
                      onClick={() => {
                        setSelectedPreviewUrl(url);
                        setIsPreviewOpen(true);
                      }}
                    >
                      <Play className="h-2.5 w-2.5 text-white" />
                    </div>
                  ) : (
                    <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}

                  {/* File name */}
                  <span
                    className="truncate text-muted-foreground cursor-pointer"
                    onClick={() => {
                      setSelectedPreviewUrl(url);
                      setIsPreviewOpen(true);
                    }}
                  >
                    {getFileName(url)}
                  </span>

                  {/* Remove */}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeFile(url)}
                      className="shrink-0 text-muted-foreground/60 hover:text-destructive transition-colors ml-auto"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Hidden file input */}
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

      {/* Lightbox */}
      {isPreviewOpen && selectedPreviewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="relative max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsPreviewOpen(false)}
              className="absolute -top-10 right-0 bg-white/10 hover:bg-white/20 text-white rounded-full p-1.5 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {getFileTypeFromUrl(selectedPreviewUrl) === "image" || fieldType === "image" ? (
              <img
                src={selectedPreviewUrl}
                alt="Full size preview"
                className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              />
            ) : getFileTypeFromUrl(selectedPreviewUrl) === "video" || fieldType === "video" ? (
              <video
                src={selectedPreviewUrl}
                controls
                autoPlay
                className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              />
            ) : (
              <div className="bg-background rounded-xl p-8 max-w-sm text-center shadow-xl">
                <FileIcon className="h-10 w-10 text-primary mx-auto mb-4" />
                <h3 className="text-base font-semibold mb-2">Preview not available</h3>
                <a
                  href={selectedPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  Download File
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
