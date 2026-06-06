"use client";

/**
 * Media (photo / video) controls for the Purchase System.
 *
 *  - MediaField   : the form uploader — add multiple images/videos, preview
 *                   thumbnails, remove. Blobs go to IndexedDB; the field value
 *                   is a lightweight MediaRef[].
 *  - MediaGallery : read-only viewer for the preview pane (images + playable
 *                   video).
 *  - useObjectUrl : resolve a stored blob to an object URL for full display,
 *                   revoking it on unmount.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Video, X, Loader2, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  saveMediaFile,
  deleteMedia,
  getMediaBlob,
  formatBytes,
  type MediaRef,
} from "@/lib/purchase-system/media";

function asRefs(value: unknown): MediaRef[] {
  return Array.isArray(value) ? (value as MediaRef[]) : [];
}

/** Resolve a stored media blob to an object URL, revoking on cleanup. */
export function useObjectUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    if (!id) {
      setUrl(null);
      return;
    }
    getMediaBlob(id).then((blob) => {
      if (revoked || !blob) return;
      current = URL.createObjectURL(blob);
      setUrl(current);
    });
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [id]);
  return url;
}

export function MediaField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: MediaRef[]) => void;
}) {
  const { toast } = useToast();
  const refs = asRefs(value);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const saved: MediaRef[] = [];
      for (const file of Array.from(files)) {
        try {
          saved.push(await saveMediaFile(file));
        } catch (err) {
          toast({
            variant: "destructive",
            title: `Skipped ${file.name}`,
            description: (err as Error)?.message,
          });
        }
      }
      if (saved.length) onChange([...refs, ...saved]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (id: string) => {
    void deleteMedia(id);
    onChange(refs.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {refs.map((ref) => (
          <Thumb key={ref.id} media={ref} onRemove={() => remove(ref.id)} />
        ))}

        <label
          className={cn(
            "h-20 w-20 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1",
            "text-muted-foreground hover:bg-accent cursor-pointer text-[11px]",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          <span>Add</span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Photos &amp; videos. On a phone this opens the camera. Stored on this device.
      </p>
    </div>
  );
}

function Thumb({ media, onRemove }: { media: MediaRef; onRemove: () => void }) {
  // Images render from the stored thumbnail (no IDB read). Videos show a poster
  // tile (first frame would need decode work; a clear video chip is enough).
  return (
    <div className="relative h-20 w-20 rounded-lg border overflow-hidden bg-muted/40 group">
      {media.kind === "image" && media.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.thumb} alt={media.name} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-1">
          <Video className="h-5 w-5" />
          <span className="text-[10px] px-1 truncate max-w-full">{formatBytes(media.size)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Remove"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Read-only gallery for the preview pane. */
export function MediaGallery({ value }: { value: unknown }) {
  const refs = asRefs(value);
  if (refs.length === 0) return <span className="text-sm text-muted-foreground">No media</span>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {refs.map((ref) => (
        <GalleryItem key={ref.id} media={ref} />
      ))}
    </div>
  );
}

function GalleryItem({ media }: { media: MediaRef }) {
  const url = useObjectUrl(media.id);
  if (media.kind === "video") {
    return (
      <div className="rounded-lg border overflow-hidden bg-black/5">
        {url ? (
          <video src={url} controls className="w-full max-h-48 bg-black" />
        ) : (
          <div className="h-28 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        <div className="px-2 py-1 text-[11px] text-muted-foreground truncate">{media.name}</div>
      </div>
    );
  }
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border overflow-hidden bg-muted/30"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={media.name} className="w-full h-28 object-cover" />
      ) : media.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.thumb} alt={media.name} className="w-full h-28 object-cover" />
      ) : (
        <div className="h-28 flex items-center justify-center text-muted-foreground">
          <FileWarning className="h-4 w-4" />
        </div>
      )}
    </a>
  );
}

/** Compact count chip for the table cell. */
export function mediaCount(value: unknown): number {
  return asRefs(value).length;
}
