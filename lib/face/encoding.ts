/**
 * Lightweight base64 encoder for face descriptors.
 *
 * Lives separately from `descriptor.ts` because `descriptor.ts` imports
 * `face-api.js` at module top (~600KB minified + a TinyFaceDetectorOptions
 * instantiation), which means anything importing from `descriptor.ts` —
 * even just this 5-line encoder — drags the entire face-api bundle into
 * the page chunk.
 *
 * Use this module from pages that only need to send already-computed
 * descriptors to the server (e.g. employee-master), not from pages that
 * actually run face detection.
 */
export function descriptorToBase64(d: Float32Array): string {
  const bytes = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
