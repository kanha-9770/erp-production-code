/**
 * Media store for the Accounts System (invoice scans / supporting documents).
 *
 * The blob plumbing is identical to the Purchase module's IndexedDB-backed
 * store, so we re-export it rather than duplicate the IndexedDB code. Records
 * keep only a lightweight `MediaRef`; swap these for real uploads to go live.
 */

export {
  saveMediaFile,
  getMediaBlob,
  deleteMedia,
  formatBytes,
  type MediaRef,
} from "@/lib/purchase-system/media";
