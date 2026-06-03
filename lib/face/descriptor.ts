"use client";

/**
 * Client-side helpers for turning an image / blob into a 128-dim face
 * descriptor. The descriptor is the only thing the server ever stores —
 * not the raw biometric points, just a one-way embedding that supports
 * distance comparison.
 *
 * Returns null when no face is found (or detection confidence is too
 * low), so callers can decide whether to retake / fall back gracefully.
 *
 * All helpers are async and pull from the lazy-loaded models — callers
 * never need to load the nets themselves.
 *
 * face-api.js is dynamic-imported via `getFaceApi()` inside each helper,
 * so importing `descriptorToBase64` (a pure 1-KB utility) from this file
 * does NOT pull face-api into the importer's initial chunk.
 */

import { getFaceApi, loadFaceModels } from "./models";

// Tuned for the 640x480 captures the FaceCaptureDialog produces. Smaller
// inputSize is faster but misses partial / edge / small faces — and
// missing a second face in frame defeats the anti-proxy guard. 416 with
// a lower scoreThreshold catches partial faces at the edge (e.g. the
// person holding a phone with someone else's photo) at modest extra
// inference cost (~50ms vs 320).
const TINY_DETECTOR_INPUT_SIZE = 224;
const TINY_DETECTOR_SCORE_THRESHOLD = 0.3;

/** Per-call detector overrides. Lets enrollment retry with a more sensitive
 *  pass (larger input, lower threshold) when the default pass finds no face. */
export interface DetectorTuning {
  inputSize?: number;
  scoreThreshold?: number;
}

async function tinyDetectorOptions(tuning?: DetectorTuning) {
  const faceapi = await getFaceApi();
  return new faceapi.TinyFaceDetectorOptions({
    inputSize: tuning?.inputSize ?? TINY_DETECTOR_INPUT_SIZE,
    scoreThreshold: tuning?.scoreThreshold ?? TINY_DETECTOR_SCORE_THRESHOLD,
  });
}

/**
 * Result returned by face detection. `faceCount` is the number of faces
 * detected in the frame; `descriptor` is populated only when faceCount
 * is exactly 1 (group photos and empty frames both fail verification by
 * design — anti-proxy guard).
 */
export interface FaceDetectionResult {
  descriptor: Float32Array | null;
  faceCount: number;
}

/**
 * Compute a descriptor from a Blob (the JPEG that FaceCaptureDialog
 * produces). Returns the 128-dim Float32Array only when exactly one
 * face is detected. Group photos (faceCount > 1) and empty frames
 * (faceCount === 0) both return descriptor=null.
 *
 * When `includeDescriptor` is false, runs ONLY the lightweight detector
 * (no landmark/recognition nets) and returns just the face count. Used
 * by the attendance widget when face verification is OFF — we still
 * need the count for the anti-proxy guard, but we don't need the
 * expensive 128-dim embedding.
 *
 * Pure helper — no DOM mutation, no React, safe to call from event
 * handlers and async pipelines.
 */
export async function computeDescriptorFromBlob(
  blob: Blob,
  includeDescriptor: boolean = true,
  tuning?: DetectorTuning,
): Promise<FaceDetectionResult> {
  await loadFaceModels();
  const url = URL.createObjectURL(blob);
  try {
    const img = await blobUrlToImage(url);
    return await computeDescriptorFromImage(img, includeDescriptor, tuning);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Same as computeDescriptorFromBlob but races against a timeout so a
 * stuck tfjs backend (CPU fallback on a slow device, missing WebGL, etc.)
 * can never freeze the UI. Returns null on timeout so the caller can fall
 * back gracefully — and in particular so REQUIRED-mode captures with
 * verification OFF still work.
 *
 * Default 30s is generous: a healthy first call on cold cache is usually
 * 2-8s; anything past 30s means something is wrong and we should let the
 * user proceed rather than make them stare at a spinner.
 */
export async function computeDescriptorFromBlobWithTimeout(
  blob: Blob,
  timeoutMs: number = 30_000,
  includeDescriptor: boolean = true,
  tuning?: DetectorTuning,
): Promise<FaceDetectionResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const work = computeDescriptorFromBlob(blob, includeDescriptor, tuning);
  const timeout = new Promise<FaceDetectionResult>((resolve) => {
    timeoutId = setTimeout(() => {
      // Don't reject — { descriptor: null, faceCount: 0 } is the same
      // shape we'd return for "no face detected", so callers already
      // handle it. Logging so the dev console makes the timeout visible.
      console.warn(
        `[face/descriptor] timed out after ${timeoutMs}ms; falling back to no-face result`,
      );
      resolve({ descriptor: null, faceCount: 0 });
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Lower-level helper used by computeDescriptorFromBlob and by callers
 * that already have an HTMLImageElement (e.g. enrollment from an existing
 * avatar URL — load the image, then call this).
 *
 * Uses detectAllFaces (not detectSingleFace) so we can refuse group
 * photos: a "proxy attempt" where two people are in frame is the
 * specific attack we're trying to prevent. The face count is always
 * returned, regardless of `includeDescriptor`, so the anti-proxy check
 * works even when the caller doesn't need the embedding.
 */
export async function computeDescriptorFromImage(
  img: HTMLImageElement,
  includeDescriptor: boolean = true,
  tuning?: DetectorTuning,
): Promise<FaceDetectionResult> {
  await loadFaceModels();
  const faceapi = await getFaceApi();
  const detectorOptions = await tinyDetectorOptions(tuning);

  // Yield to the browser's event loop before starting heavy inference.
  // This allows React to paint the "Analyzing..." spinner to the screen
  // instead of freezing the UI immediately.
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (!includeDescriptor) {
    // Fast path: just count faces. Skips the landmark + recognition
    // nets, so this is ~5–10× faster than the full pipeline. Used when
    // face verification is OFF — we still want anti-proxy enforcement
    // but we don't need the 128-dim embedding for matching.
    const detections = await faceapi.detectAllFaces(img, detectorOptions);
    return { descriptor: null, faceCount: detections.length };
  }
  const detections = await faceapi
    .detectAllFaces(img, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptors();
  const faceCount = detections.length;
  if (faceCount !== 1) {
    return { descriptor: null, faceCount };
  }
  // face-api returns its own Float32Array. We clone so the caller can
  // safely keep / serialize it without worrying about face-api reusing
  // the underlying buffer.
  return {
    descriptor: new Float32Array(detections[0].descriptor),
    faceCount: 1,
  };
}

/**
 * Robust descriptor extraction for ENROLLMENT (profile photo / employee
 * master). Tries the standard detector first; if it finds no face, retries
 * once with a more sensitive pass (larger input, lower threshold) that
 * catches faces the fast 224px pass misses — slightly turned heads, softer
 * lighting, small or off-centre faces. This is the single biggest reason a
 * user uploads a photo yet stays "not enrolled" for attendance.
 *
 * A group photo (faceCount > 1) is returned as-is on the first pass — we
 * never retry into enrolling a multi-face baseline (anti-proxy guard).
 *
 * The sensitive retry is only paid when the first pass found nothing, so the
 * common case (clear front-facing photo) stays as fast as before.
 */
export async function computeEnrollmentDescriptor(
  blob: Blob,
): Promise<FaceDetectionResult> {
  const first = await computeDescriptorFromBlobWithTimeout(blob);
  if (first.faceCount >= 1) return first;
  // faceCount === 0 (or timed out → 0): retry with a more sensitive detector.
  return computeDescriptorFromBlobWithTimeout(blob, 30_000, true, {
    inputSize: 512,
    scoreThreshold: 0.2,
  });
}

/**
 * Encode a Float32Array as a base64 string for transport in a FormData
 * field. 128 floats × 4 bytes = 512 bytes → ~684 chars in base64; well
 * within any reasonable form-field size limit.
 */
export function descriptorToBase64(d: Float32Array): string {
  const bytes = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function blobUrlToImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode captured image"));
    img.src = url;
  });
}

/**
 * Passive liveness check: given 3 video-frame snapshots of the same
 * scene, returns whether the face moved enough between frames to look
 * like a real person (vs a held-up photo or static phone screen).
 *
 * How it works:
 *   1. Detect 68 facial landmarks in each frame.
 *   2. Anchor on the nose-tip landmark (most stable). Subtract the
 *      anchor's xy from every landmark in that frame — this removes
 *      "I shifted the photo a centimetre" rigid translation. What's
 *      left is INTRA-face deformation (eyes blinking, mouth twitching,
 *      head tilting subtly), which a flat photo cannot produce.
 *   3. Average the per-landmark displacement between consecutive
 *      frames; sum across both transitions.
 *
 * Decision bands (motion = the summed avg displacement in pixels):
 *   < MIN_MOTION_PX      → static (photo / screen) → not alive
 *   MIN..MAX             → normal human fidget → alive
 *   > MAX_MOTION_PX      → too much motion (waving the camera around
 *                          to fake liveness) → not alive
 *
 * Returns null `passed` when detection failed on any frame — the caller
 * uses faceLivenessMode (PERMISSIVE vs STRICT) to decide what to do
 * with that ambiguous result.
 */
export interface LivenessResult {
  passed: boolean | null; // null = couldn't determine (errored / missing landmarks)
  motion: number; // total intra-face landmark displacement in pixels
  frames: number; // how many of the input frames had a detectable face
}

const MIN_MOTION_PX = 1.5;
const MAX_MOTION_PX = 60;

export async function computeLivenessFromBlobs(
  blobs: Blob[],
): Promise<LivenessResult> {
  if (blobs.length < 2) {
    // Need at least two frames to measure motion. Caller should always
    // pass 3, but be defensive.
    return { passed: null, motion: 0, frames: blobs.length };
  }
  await loadFaceModels();
  const faceapi = await getFaceApi();
  const detectorOptions = await tinyDetectorOptions();

  // Decode all blobs in parallel, then detect landmarks for each. We
  // skip the recognition net here — only landmarks are needed for the
  // motion comparison, which saves ~1s per frame.
  const urls = blobs.map((b) => URL.createObjectURL(b));
  try {
    const images = await Promise.all(urls.map(blobUrlToImage));

    // Process frames sequentially with yields in between. Promise.all()
    // would dispatch 3 heavy inferences concurrently, which starves the
    // event loop for a very long time and feels like a hard freeze.
    const detections = [];
    for (const img of images) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      const detection = await faceapi
        .detectSingleFace(img, detectorOptions)
        .withFaceLandmarks();
      detections.push(detection);
    }

    // Frames where we couldn't find a face are useless. Bail with null
    // so the caller can apply its policy.
    const valid = detections.filter((d): d is NonNullable<typeof d> => !!d);
    if (valid.length < 2) {
      return { passed: null, motion: 0, frames: valid.length };
    }

    // Anchor each frame's landmarks on the nose tip (landmark 30, the
    // tip of the nose in the 68-point model) so rigid translation of
    // the whole face doesn't count as "motion."
    const anchored = valid.map((d) => {
      const points = d.landmarks.positions;
      const anchor = points[30];
      return points.map((p) => ({ x: p.x - anchor.x, y: p.y - anchor.y }));
    });

    // Sum the average per-landmark displacement between consecutive
    // anchored frames.
    let totalMotion = 0;
    for (let i = 1; i < anchored.length; i++) {
      const a = anchored[i - 1];
      const b = anchored[i];
      const len = Math.min(a.length, b.length);
      let sum = 0;
      for (let j = 0; j < len; j++) {
        const dx = a[j].x - b[j].x;
        const dy = a[j].y - b[j].y;
        sum += Math.sqrt(dx * dx + dy * dy);
      }
      totalMotion += sum / len;
    }

    const passed = totalMotion >= MIN_MOTION_PX && totalMotion <= MAX_MOTION_PX;
    return { passed, motion: totalMotion, frames: valid.length };
  } catch (err) {
    console.warn("[face/liveness] detection failed:", err);
    return { passed: null, motion: 0, frames: 0 };
  } finally {
    for (const u of urls) URL.revokeObjectURL(u);
  }
}
