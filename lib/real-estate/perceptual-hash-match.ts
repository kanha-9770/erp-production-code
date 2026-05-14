/**
 * Server-side perceptual-hash matching.
 *
 * Hashes are stored in `Lead.photoPhash` as one of two formats:
 *
 *   16 hex chars  — legacy (dHash only).  Older rows from before the
 *                   dual-hash upgrade. We still match on these via the
 *                   dHash side and ignore pHash.
 *
 *   32 hex chars  — current.  First 16 = dHash, next 16 = pHash.
 *                   We match if EITHER signal clears its threshold;
 *                   that's what makes "same photo, different upload
 *                   path" reliably trip even when the bytes differ
 *                   enough that dHash alone would miss.
 *
 * Thresholds were chosen empirically against real-world camera /
 * gallery / re-encoded JPEG pairs:
 *
 *   dHash ≤ 15  — close JPEG, same crop. Bumped up from 10 because
 *                 mobile cameras + auto-correction routinely add 6–12
 *                 bits of difference on the SAME visual.
 *
 *   pHash ≤ 12  — perceptually identical regardless of encoder. The
 *                 DCT throws away the noisy high frequencies that
 *                 wreck dHash, so 12 is a safe tight bound.
 *
 * Either threshold passes → duplicate. Both fail → fall through to
 * phone/email check (or no match at all).
 */

export const PHASH_HEX_LENGTH_LEGACY = 16; // dHash-only stored value
export const PHASH_HEX_LENGTH_COMBINED = 32; // dHash + pHash concatenated

export const DHASH_HAMMING_THRESHOLD = 15;
export const PHASH_HAMMING_THRESHOLD = 12;

/**
 * Backward-compat alias for the old export name still imported by
 * `real-estate-leads.ts`. Keeps the public surface the same.
 */
export const PHASH_HAMMING_THRESHOLD_LEGACY = DHASH_HAMMING_THRESHOLD;

export interface ParsedHash {
  /** dHash half — present in both legacy (16-char) and combined (32-char) values. */
  dhash: bigint | null;
  /** pHash half — present only when the stored value is 32 chars. */
  phash: bigint | null;
}

/**
 * Parses either format into BigInts. Returns `{ dhash: null, phash: null }`
 * for malformed input so callers can simply skip those candidates without
 * a try/catch around every read.
 */
export function parsePhashHex(hex: string | null | undefined): ParsedHash {
  const empty: ParsedHash = { dhash: null, phash: null };
  if (!hex || typeof hex !== "string") return empty;
  const s = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(s)) return empty;

  if (s.length === PHASH_HEX_LENGTH_LEGACY) {
    try {
      return { dhash: BigInt("0x" + s), phash: null };
    } catch {
      return empty;
    }
  }
  if (s.length === PHASH_HEX_LENGTH_COMBINED) {
    try {
      return {
        dhash: BigInt("0x" + s.slice(0, 16)),
        phash: BigInt("0x" + s.slice(16, 32)),
      };
    } catch {
      return empty;
    }
  }
  return empty;
}

/**
 * Hamming distance between two 64-bit values. Kernighan bit-count on
 * the XOR — O(set bits), which is O(distance), so similar-image
 * comparisons (the common case) finish in a handful of iterations.
 */
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let distance = 0;
  const ZERO = BigInt(0);
  const ONE = BigInt(1);
  while (xor !== ZERO) {
    xor &= xor - ONE;
    distance += 1;
  }
  return distance;
}

export interface PhashMatchResult<T> {
  candidate: T;
  /** Which half matched and at what distance. */
  signal: "dhash" | "phash";
  distance: number;
}

/**
 * Compare two parsed hashes; returns the winning signal + distance if
 * either side clears its threshold, otherwise null. Used both by the
 * dup-detection sweep AND by the admin-duplicates page to display
 * "matched by photo · dHash 7 / pHash 3".
 */
export function comparePhashes(
  a: ParsedHash,
  b: ParsedHash,
  dHashThreshold: number = DHASH_HAMMING_THRESHOLD,
  pHashThreshold: number = PHASH_HAMMING_THRESHOLD,
): { signal: "dhash" | "phash"; distance: number } | null {
  // Prefer pHash when available on both sides — it's the perceptually-
  // accurate signal. We still check dHash so a same-encoded re-upload
  // (where pHash might be slightly off due to small render diffs)
  // doesn't slip past us.
  if (a.phash != null && b.phash != null) {
    const pd = hammingDistance(a.phash, b.phash);
    if (pd <= pHashThreshold) return { signal: "phash", distance: pd };
  }
  if (a.dhash != null && b.dhash != null) {
    const dd = hammingDistance(a.dhash, b.dhash);
    if (dd <= dHashThreshold) return { signal: "dhash", distance: dd };
  }
  return null;
}

/**
 * Pick the best perceptual-hash match (smallest weighted distance) from
 * a pool of candidates. Returns null if none clears either threshold.
 *
 * Each candidate's `phash` field is the stored 16- or 32-char hex from
 * the DB; we parse it on the fly.
 */
export function findBestPhashMatch<T extends { phash: string | null | undefined; id: string }>(
  target: ParsedHash | bigint,
  candidates: T[],
  dHashThreshold: number = DHASH_HAMMING_THRESHOLD,
  pHashThreshold: number = PHASH_HAMMING_THRESHOLD,
): PhashMatchResult<T> | null {
  // Normalise the target: if a bare BigInt is passed (legacy callsite),
  // treat it as a dHash-only value.
  const targetParsed: ParsedHash =
    typeof target === "bigint" ? { dhash: target, phash: null } : target;

  let best: PhashMatchResult<T> | null = null;
  for (const c of candidates) {
    const cHash = parsePhashHex(c.phash);
    const hit = comparePhashes(targetParsed, cHash, dHashThreshold, pHashThreshold);
    if (!hit) continue;
    if (best == null || hit.distance < best.distance) {
      best = { candidate: c, signal: hit.signal, distance: hit.distance };
      if (hit.distance === 0) break; // can't do better than identical
    }
  }
  return best;
}
