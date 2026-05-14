/**
 * Server-side face verification helpers.
 *
 * The server NEVER runs face detection or descriptor extraction — those
 * happen in the browser via face-api.js. The server only:
 *   1. Decodes the base64 descriptor the client posts
 *   2. Loads the user's enrolled descriptor from the FaceEnrollment row
 *   3. Computes Euclidean distance between the two 128-dim vectors
 *
 * Lower distance = better match. face-api.js convention:
 *   < 0.45  very strict (false rejects on lighting changes)
 *   ~0.55   practical default
 *   > 0.65  loose (false accepts on similar-looking people)
 *
 * This file is intentionally tiny and dependency-free so the photo route
 * has no extra cost. Swapping in a cloud verifier later means rewriting
 * only this file — neither the upload pipeline nor the schema changes.
 */

export const DESCRIPTOR_LENGTH = 128;
export const DESCRIPTOR_BYTES = DESCRIPTOR_LENGTH * 4; // Float32 = 4 bytes

/**
 * Decode the base64 descriptor sent by the client into a Float32Array.
 * Returns null on any decoding error or wrong length so the caller can
 * skip verification gracefully (e.g. treat as "no descriptor sent").
 */
export function decodeDescriptor(raw: unknown): Float32Array | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  if (buf.byteLength !== DESCRIPTOR_BYTES) return null;
  // Float32Array.from a Buffer's underlying ArrayBuffer at the right offset.
  // We copy into a fresh ArrayBuffer because Buffer's underlying buffer is
  // typically shared with other allocations.
  const ab = new ArrayBuffer(DESCRIPTOR_BYTES);
  new Uint8Array(ab).set(buf);
  return new Float32Array(ab);
}

/** Convert a Float32Array descriptor to the Bytes value Prisma stores. */
export function descriptorToBytes(d: Float32Array): Buffer {
  if (d.length !== DESCRIPTOR_LENGTH) {
    throw new Error(
      `descriptor must be ${DESCRIPTOR_LENGTH} floats, got ${d.length}`,
    );
  }
  return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
}

/** Read the Bytes value back from a FaceEnrollment row. */
export function bytesToDescriptor(b: Buffer | Uint8Array): Float32Array {
  if (b.byteLength !== DESCRIPTOR_BYTES) {
    throw new Error(
      `enrolled descriptor has wrong byte length: ${b.byteLength}`,
    );
  }
  // Copy into a fresh ArrayBuffer to detach from whatever buffer Prisma
  // returned (which may be a slice of a larger pool).
  const ab = new ArrayBuffer(DESCRIPTOR_BYTES);
  new Uint8Array(ab).set(b);
  return new Float32Array(ab);
}

/**
 * Euclidean distance between two 128-dim descriptors. This is the same
 * metric face-api.js uses internally; copying it here avoids pulling the
 * whole face-api package into the server bundle.
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`descriptor length mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}
