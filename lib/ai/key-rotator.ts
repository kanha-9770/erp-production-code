/**
 * In-process API-key rotator with least-recently-used selection + cooldown.
 *
 * Hot-path state lives in a Map; failures are persisted to Postgres so admin
 * UI reflects them and other replicas converge within the cache TTL. When you
 * need strict multi-replica coordination, replace this module with a Redis-
 * backed implementation — the public surface (pickKey / markSuccess /
 * markFailure) is what consumers import, so routes never change.
 */

import { prisma } from "@/lib/prisma";
import { decryptApiKey } from "./crypto";
import type { ResolvedKey } from "./types";

interface KeyState {
  id: string;
  providerId: string;
  label: string;
  encryptedKey: string;
  keyPreview: string;
  lastUsedAt: number;
  cooldownUntil: number;
  failureCount: number;
  disabled: boolean;
}

const stateByProvider = new Map<string, Map<string, KeyState>>();
let lastSync = 0;
const SYNC_TTL_MS = 15_000;

async function syncFromDb(providerId: string): Promise<void> {
  const now = Date.now();
  if (now - lastSync < SYNC_TTL_MS && stateByProvider.has(providerId)) return;

  const rows = await prisma.aIProviderKey.findMany({
    where: { providerId, isActive: true },
  });

  const map = new Map<string, KeyState>();
  for (const r of rows) {
    const prev = stateByProvider.get(providerId)?.get(r.id);
    map.set(r.id, {
      id: r.id,
      providerId: r.providerId,
      label: r.label,
      encryptedKey: r.encryptedKey,
      keyPreview: r.keyPreview,
      lastUsedAt: prev?.lastUsedAt ?? (r.lastUsedAt?.getTime() ?? 0),
      cooldownUntil: prev?.cooldownUntil ?? (r.cooldownUntil?.getTime() ?? 0),
      failureCount: prev?.failureCount ?? r.failureCount,
      disabled: false,
    });
  }
  stateByProvider.set(providerId, map);
  lastSync = now;
}

export async function pickKey(providerId: string): Promise<ResolvedKey | null> {
  await syncFromDb(providerId);
  const map = stateByProvider.get(providerId);
  if (!map || map.size === 0) return null;

  const now = Date.now();
  let chosen: KeyState | null = null;

  for (const k of map.values()) {
    if (k.disabled) continue;
    if (k.cooldownUntil > now) continue;
    if (!chosen || k.lastUsedAt < chosen.lastUsedAt) chosen = k;
  }
  if (!chosen) return null;

  chosen.lastUsedAt = now;

  try {
    return {
      id: chosen.id,
      label: chosen.label,
      plaintext: decryptApiKey(chosen.encryptedKey),
      keyPreview: chosen.keyPreview,
    };
  } catch (err) {
    console.error("[key-rotator] decrypt failed for key", chosen.id, err);
    chosen.disabled = true;
    return null;
  }
}

export async function markSuccess(providerId: string, keyId: string): Promise<void> {
  const k = stateByProvider.get(providerId)?.get(keyId);
  if (k) {
    k.failureCount = 0;
    k.cooldownUntil = 0;
  }
  prisma.aIProviderKey
    .update({
      where: { id: keyId },
      data: { lastUsedAt: new Date(), failureCount: 0, cooldownUntil: null },
    })
    .catch((err) => console.error("[key-rotator] markSuccess write-back failed", err));
}

export async function markFailure(
  providerId: string,
  keyId: string,
  kind: "auth" | "rate_limit" | "server"
): Promise<void> {
  const k = stateByProvider.get(providerId)?.get(keyId);
  if (!k) return;

  k.failureCount += 1;
  const now = Date.now();
  let cooldownMs = 0;
  let disable = false;

  if (kind === "auth") {
    disable = true;
  } else if (kind === "rate_limit") {
    cooldownMs = 60_000;
  } else {
    cooldownMs = k.failureCount >= 3 ? 30_000 : 5_000;
  }

  k.cooldownUntil = cooldownMs ? now + cooldownMs : k.cooldownUntil;
  k.disabled = disable;

  prisma.aIProviderKey
    .update({
      where: { id: keyId },
      data: {
        failureCount: k.failureCount,
        cooldownUntil: cooldownMs ? new Date(now + cooldownMs) : null,
        isActive: disable ? false : undefined,
      },
    })
    .catch((err) => console.error("[key-rotator] markFailure write-back failed", err));
}

export function invalidateProvider(providerId: string): void {
  stateByProvider.delete(providerId);
  lastSync = 0;
}
