"use client";

/**
 * Lazy loader for face-api.js weights.
 *
 * The three nets we use:
 *   - TinyFaceDetector    — fast face detection, low memory
 *   - FaceLandmark68Net   — 68-point landmark detection (used to align
 *                            the face before descriptor extraction)
 *   - FaceRecognitionNet  — 128-dim descriptor (the "fingerprint")
 *
 * Weights live under /public/models so they're served by Next from the
 * same origin. ~7 MB total, downloaded once per browser; subsequent loads
 * are instant thanks to HTTP caching.
 *
 * loadFaceModels() is idempotent — repeated calls share the same in-flight
 * Promise. Safe to call from any client component that's about to detect
 * a face; the cost is only paid the first time.
 *
 * face-api.js itself (~6 MB minified + tfjs-core) is loaded via dynamic
 * import the first time loadFaceModels() runs, so any page that merely
 * imports a helper from `lib/face/*` does NOT ship face-api in its
 * initial chunk. The lib only arrives when the user opens the face
 * capture dialog (or otherwise triggers detection).
 */

const MODEL_URL = "/models";

type FaceApiModule = typeof import("face-api.js");

let faceApiPromise: Promise<FaceApiModule> | null = null;
let loadPromise: Promise<void> | null = null;

export function getFaceApi(): Promise<FaceApiModule> {
  return (faceApiPromise ??= import("face-api.js"));
}

export function loadFaceModels(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const faceapi = await getFaceApi();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  })().catch((err) => {
    // Reset on failure so the next call retries instead of returning a
    // permanently-rejected promise.
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}
