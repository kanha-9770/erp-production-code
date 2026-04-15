/**
 * AES-256-GCM encryption for AI provider API keys.
 *
 * Key resolution order:
 *   1. process.env.AI_KEYS_SECRET  (hex, base64, or 32-byte utf8)
 *   2. <project>/.ai-keys-secret   (auto-generated file, persists across restarts)
 *
 * If neither exists, we generate a fresh 32-byte secret, persist it to the
 * project-root file, and log a warning. This gives a zero-friction dev
 * experience while still being a real secret that survives restarts. For
 * production, set AI_KEYS_SECRET explicitly so you control its rotation.
 *
 * ⚠ If the file/env is ever lost, previously-encrypted keys become unrecoverable.
 * Stored format: base64(iv(12) || authTag(16) || ciphertext)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SECRET_FILE = path.join(process.cwd(), ".ai-keys-secret");

let cachedSecret: Buffer | null = null;

function parseSecret(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  if (/^[A-Za-z0-9+/=]{44}$/.test(trimmed)) {
    const b = Buffer.from(trimmed, "base64");
    if (b.length === 32) return b;
  }
  const utf8 = Buffer.from(trimmed, "utf8");
  if (utf8.length === 32) return utf8;
  return null;
}

function tryLoadFromFile(): Buffer | null {
  try {
    if (!fs.existsSync(SECRET_FILE)) return null;
    const content = fs.readFileSync(SECRET_FILE, "utf8");
    return parseSecret(content);
  } catch (err) {
    console.warn("[ai/crypto] Failed to read .ai-keys-secret:", (err as Error).message);
    return null;
  }
}

function generateAndPersist(): Buffer {
  const fresh = crypto.randomBytes(32);
  const hex = fresh.toString("hex");
  try {
    fs.writeFileSync(SECRET_FILE, hex + "\n", { mode: 0o600 });
    console.warn(
      "\n[ai/crypto] Generated a new AI_KEYS_SECRET and saved to .ai-keys-secret.\n" +
        "           Add '.ai-keys-secret' to .gitignore and BACK IT UP — if this file is lost,\n" +
        "           all stored provider API keys become unrecoverable.\n"
    );
  } catch (err) {
    console.warn(
      "[ai/crypto] Could not write .ai-keys-secret — using an in-memory key for this process only:",
      (err as Error).message
    );
  }
  return fresh;
}

function getSecret(): Buffer {
  if (cachedSecret) return cachedSecret;

  const envValue = process.env.AI_KEYS_SECRET;
  if (envValue) {
    const parsed = parseSecret(envValue);
    if (parsed) {
      cachedSecret = parsed;
      return cachedSecret;
    }
    throw new Error(
      "AI_KEYS_SECRET is set but not a valid 32-byte key. Use 64 hex chars, 44 base64 chars, or raw 32-byte utf8."
    );
  }

  const fromFile = tryLoadFromFile();
  if (fromFile) {
    cachedSecret = fromFile;
    return cachedSecret;
  }

  cachedSecret = generateAndPersist();
  return cachedSecret;
}

export function encryptApiKey(plaintext: string): string {
  const key = getSecret();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptApiKey(payload: string): string {
  const key = getSecret();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function makeKeyPreview(plaintext: string): string {
  if (plaintext.length <= 8) return "••••";
  return `${plaintext.slice(0, 4)}…${plaintext.slice(-4)}`;
}
