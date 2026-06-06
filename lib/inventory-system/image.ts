/**
 * Client-side image helper. Reads a File and returns a downscaled JPEG/PNG data
 * URL so item images can live in localStorage without blowing the ~5 MB quota.
 * Frontend-only — when a real backend exists, swap this for an upload that
 * returns a URL and store that instead.
 */

const MAX_DIM = 512; // longest edge, px
const QUALITY = 0.82;

export function fileToResizedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load the image."));
      img.onload = () => {
        const { width, height } = img;
        const scale = Math.min(1, MAX_DIM / Math.max(width, height));
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fall back to the raw data URL if canvas is unavailable.
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        // PNGs with transparency keep PNG; everything else → JPEG for size.
        const useJpeg = file.type !== "image/png";
        resolve(canvas.toDataURL(useJpeg ? "image/jpeg" : "image/png", QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
