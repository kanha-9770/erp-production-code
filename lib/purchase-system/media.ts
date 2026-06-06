/**
 * Media store for the Purchase System (inspection photos / videos).
 *
 * Videos are far too large for localStorage, so the actual blobs live in
 * IndexedDB (hundreds of MB of quota) and the record snapshot keeps only a
 * lightweight `MediaRef` (id + kind + name + a tiny image thumbnail). This is
 * still frontend-only and self-contained — swap these functions for real
 * uploads (returning a URL) to go live, and the UI is unchanged.
 */

export interface MediaRef {
  id: string;
  kind: "image" | "video";
  name: string;
  size: number;
  type: string;
  /** Small data-URL preview for images (so lists render without an IDB read). */
  thumb?: string;
}

const DB_NAME = "erp-purchase-media";
const STORE = "blobs";
const DB_VERSION = 1;

function uid(): string {
  return `med_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open media store"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

const MAX_IMAGE_DIM = 256; // thumbnail longest edge

function makeImageThumb(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(undefined);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(undefined);
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(undefined);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Persist a file and return its reference. */
export async function saveMediaFile(file: File): Promise<MediaRef> {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) throw new Error("Only image or video files are allowed.");

  const id = uid();
  await withStore("readwrite", (store) =>
    store.put({ id, blob: file, name: file.name, type: file.type }),
  );
  const thumb = isImage ? await makeImageThumb(file) : undefined;
  return {
    id,
    kind: isVideo ? "video" : "image",
    name: file.name,
    size: file.size,
    type: file.type,
    thumb,
  };
}

/** Fetch a stored blob (for playback / full-size display). */
export async function getMediaBlob(id: string): Promise<Blob | null> {
  try {
    const rec = (await withStore<{ blob: Blob } | undefined>("readonly", (store) =>
      store.get(id),
    )) as { blob: Blob } | undefined;
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteMedia(id: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(id));
  } catch {
    /* best-effort cleanup */
  }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
