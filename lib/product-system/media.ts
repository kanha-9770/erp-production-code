/**
 * Media store for the Product Master (machine images / videos). The blob
 * plumbing is identical to the Purchase module's IndexedDB-backed store, so we
 * re-export it rather than duplicate the IndexedDB code.
 */

export {
  saveMediaFile,
  getMediaBlob,
  deleteMedia,
  formatBytes,
  type MediaRef,
} from "@/lib/purchase-system/media";
