"use client";

/**
 * Media controls for the Accounts System. The uploader/gallery are identical to
 * the Purchase module's (both back onto the shared IndexedDB media store), so
 * we re-export rather than duplicate the component.
 */

export { MediaField, MediaGallery, mediaCount, useObjectUrl } from "@/components/purchase-system/media-field";
