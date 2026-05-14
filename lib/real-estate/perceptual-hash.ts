"use client";

/**
 * Perceptual image hashing — browser-side dHash + pHash combined.
 *
 * ── Why two hashes, not one ─────────────────────────────────────────────
 * dHash alone was too brittle in practice:
 *   - Camera vs gallery upload of the "same" photo go through different
 *     JPEG quantisation tables → tens of bits of dHash difference.
 *   - A small auto-correction (white balance, exposure) by the camera
 *     pipeline tilts the row-difference comparisons across whole
 *     regions of the image.
 *   - dHash is great at "is this the exact same JPEG?" and weak at
 *     "is this visually the same scene?".
 *
 * pHash (DCT-based) is the inverse: bad at byte-equality, GREAT at
 * "looks the same to a human" because the discrete cosine transform
 * throws away high frequencies (compression noise, slight sharpening)
 * and keeps the dominant brightness layout.
 *
 * We compute BOTH on every photo and store them concatenated:
 *
 *   <dhash 16 hex chars><phash 16 hex chars>   ──> 32-char compound string
 *
 * The server-side matcher checks both halves with appropriate
 * thresholds — passing either is "same image". Production-grade
 * image-similarity pipelines (TinEye, Google reverse-image,
 * Cloudinary perceptual_similarity_method) all combine multiple
 * algorithms this way for the same reason.
 *
 * Backward compatibility: legacy rows still in the DB with just 16
 * hex chars are treated as dHash-only and matched on the dHash half.
 *
 * ── Threat model recap ─────────────────────────────────────────────────
 *  Agent A captures Jane (phone, photo).
 *  Agent B wants to "fool" the dup-check, types phone wrong on purpose
 *  but uploads the same passport-style snap of Jane.
 *  → Phone match misses (different digits).
 *  → Email match misses (none).
 *  → pHash compares low-frequency layout of both photos → near-zero
 *    distance → DUPLICATE FLAGGED. Admin sees it.
 */

const DHASH_WIDTH = 9; // 9 columns → 8 horizontal comparisons per row
const DHASH_HEIGHT = 8; // 8 rows × 8 comparisons = 64 bits

// pHash: standard 32×32 → DCT → keep top-left 8×8 → median threshold.
const PHASH_DCT_SIZE = 32;
const PHASH_KEEP = 8; // 8×8 low-frequency coefficients = 64 bits

export interface ImageHashes {
  /** 16-char lowercase hex; difference-hash (good at byte/format match). */
  dhash: string;
  /** 16-char lowercase hex; DCT-hash (good at perceptual match). */
  phash: string;
  /** Concatenated `dhash + phash` — what gets stored in `Lead.photoPhash`. */
  combined: string;
}

/**
 * Compute both perceptual hashes for an image File and return them
 * along with the concatenated string the server expects.
 *
 * Returns null if the file can't be decoded as an image (the caller
 * should treat this as "no hash" and fall back to phone/email
 * matching only — never block the lead capture on hash failure).
 */
export async function computeImageHashes(
  file: File,
): Promise<ImageHashes | null> {
  if (typeof window === "undefined") return null;
  if (!file.type.startsWith("image/")) return null;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);

    // Two grids, two purposes. dHash needs 9×8 (rectangular for the
    // horizontal compare). pHash needs 32×32 (square, large enough
    // that the DCT's low-frequency 8×8 corner is meaningful).
    const dPixels = drawToGreyscale(img, DHASH_WIDTH, DHASH_HEIGHT);
    const pPixels = drawToGreyscale(img, PHASH_DCT_SIZE, PHASH_DCT_SIZE);
    if (!dPixels || !pPixels) return null;

    const dhash = dHashFromGreyscale(dPixels, DHASH_WIDTH, DHASH_HEIGHT);
    const phash = pHashFromGreyscale(pPixels, PHASH_DCT_SIZE, PHASH_KEEP);
    return { dhash, phash, combined: dhash + phash };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[perceptual-hash] failed:", err);
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Backward-compat wrapper — older callers expect a single string. Now
 * returns the 32-char compound hash instead of dHash-alone. The server
 * detects format by length.
 */
export async function computeImagePhash(file: File): Promise<string | null> {
  const hashes = await computeImageHashes(file);
  return hashes?.combined ?? null;
}

// ─── Image → greyscale pixels via Canvas ──────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function drawToGreyscale(
  img: HTMLImageElement,
  width: number,
  height: number,
): Uint8Array | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  // High-quality image-smoothing acts as a small low-pass filter for free
  // — that's exactly what we want before downsampling for either hash.
  (ctx as any).imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    // BT.601 luma — close enough to perceived brightness.
    out[j] = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
    );
  }
  return out;
}

// ─── dHash ───────────────────────────────────────────────────────────────

function dHashFromGreyscale(
  pixels: Uint8Array,
  width: number,
  height: number,
): string {
  let bits = BigInt(0);
  let bitIndex = 0;
  const one = BigInt(1);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width - 1; x++) {
      const left = pixels[rowStart + x];
      const right = pixels[rowStart + x + 1];
      if (left > right) bits |= one << BigInt(bitIndex);
      bitIndex += 1;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

// ─── pHash (DCT-II based) ────────────────────────────────────────────────
//
// Standard pipeline:
//   1. 32×32 greyscale (done by drawToGreyscale).
//   2. 2D DCT-II via the separable property: 1D DCT on each row, then
//      1D DCT on each column. O(N³) total; trivial for N=32.
//   3. Keep the top-left 8×8 (low frequencies — the part that survives
//      JPEG compression and small edits).
//   4. Compute the median of those 64 values, EXCLUDING the DC
//      coefficient at [0,0] (it dominates the median otherwise).
//   5. For each of the 64 coefficients: bit = 1 if value > median.

function pHashFromGreyscale(
  pixels: Uint8Array,
  size: number,
  keep: number,
): string {
  // Lift to floats so the DCT can run in real numbers.
  const matrix: Float32Array[] = [];
  for (let y = 0; y < size; y++) {
    const row = new Float32Array(size);
    for (let x = 0; x < size; x++) row[x] = pixels[y * size + x];
    matrix.push(row);
  }

  // Row DCT.
  const rowDct: Float32Array[] = matrix.map((r) => dct1d(r, size));

  // Column DCT. We only need the top-left `keep × keep` block, so
  // for each output column 0..keep-1 we DCT only that column of the
  // row-transformed grid.
  const block: number[][] = [];
  for (let y = 0; y < keep; y++) block.push(new Array<number>(keep).fill(0));

  // Compute the full column DCT for the first `keep` columns only —
  // that's still O(size × size) work; the savings come from not
  // computing the high-frequency columns we'd throw away anyway.
  for (let col = 0; col < keep; col++) {
    const column = new Float32Array(size);
    for (let y = 0; y < size; y++) column[y] = rowDct[y][col];
    const colDct = dct1d(column, size);
    for (let row = 0; row < keep; row++) {
      block[row][col] = colDct[row];
    }
  }

  // Median across the 8×8 block, EXCLUDING the DC component at [0,0].
  // Including DC biases the threshold toward overall brightness and
  // flattens the hash for low-contrast images.
  const coefs: number[] = [];
  for (let y = 0; y < keep; y++) {
    for (let x = 0; x < keep; x++) {
      if (x === 0 && y === 0) continue;
      coefs.push(block[y][x]);
    }
  }
  coefs.sort((a, b) => a - b);
  const median = coefs[Math.floor(coefs.length / 2)];

  // Bit-pack: 1 if coefficient > median. Iterate in row-major order so
  // a given image always produces the same bit order across runs.
  let bits = BigInt(0);
  let bitIndex = 0;
  const one = BigInt(1);
  for (let y = 0; y < keep; y++) {
    for (let x = 0; x < keep; x++) {
      if (block[y][x] > median) bits |= one << BigInt(bitIndex);
      bitIndex += 1;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

/**
 * 1D DCT-II of length N. Naive O(N²) — N is 32 here, so 1024 muls per
 * call, 32 calls per row pass, 32 calls per column pass — ~65k muls
 * total, well under a millisecond on any device that can run a browser.
 */
function dct1d(input: Float32Array, N: number): Float32Array {
  const output = new Float32Array(N);
  const piOverN = Math.PI / N;
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos(piOverN * (n + 0.5) * k);
    }
    output[k] = sum;
  }
  return output;
}
