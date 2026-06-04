/**
 * Web Push — server-side dispatch helper.
 *
 * Loads VAPID credentials from env, then provides a single entry point
 * `sendPushToUsers` that fans a payload out to every push subscription
 * stored for the supplied user IDs.
 *
 * Fire-and-forget by design: the caller (workflow trigger) shouldn't block
 * the request on FCM/APNs round-trips, and one bad subscription should not
 * dump the whole batch.
 *
 * Env vars required (set in `.env.local`):
 *   VAPID_PUBLIC_KEY   — same value also exposed to the browser
 *   VAPID_PRIVATE_KEY  — signs the JWT in the push header; keep secret
 *   VAPID_SUBJECT      — `mailto:ops@yourcompany.com` (or a URL); FCM uses it
 *
 * Generate a pair once with `npx web-push generate-vapid-keys` and paste
 * them in.
 */

import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!pub || !priv) {
    console.warn(
      '[push] VAPID keys not set — push will be skipped. Run `npx web-push generate-vapid-keys` and add VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to .env.local.',
    );
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  /** When true (default in the service worker), the popup stays on screen
   *  until the user taps or dismisses it — ChatGPT-style. Set false for
   *  low-priority messages that may auto-fade. */
  requireInteraction?: boolean;
}

/**
 * Send `payload` to every push subscription registered for any of `userIds`.
 * One user may have several subscriptions (phone + laptop + tablet) — each
 * one gets its own push.
 *
 * Returns once all attempts settle so the caller can `void` it without leaks.
 * Subscriptions the push service has expired (HTTP 404 / 410) are deleted
 * automatically so the table doesn't bloat with stale rows.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;
  if (!userIds.length) return;

  const subs = await (prisma as any).pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (!subs.length) return;

  const data = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          data,
        );
        // Touch lastUsedAt so admins can tell stale rows from active ones,
        // and so a future cleanup job can purge subscriptions silent for
        // months.
        await (prisma as any).pushSubscription
          .update({
            where: { id: s.id },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => {});
      } catch (err: any) {
        const status = err?.statusCode;
        // 404 / 410 = subscription is gone (user revoked permission or
        // uninstalled the PWA). Drop the row so we stop retrying it.
        if (status === 404 || status === 410) {
          await (prisma as any).pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
          return;
        }
        console.warn(
          `[push] dispatch failed for sub ${s.id} (status=${status}):`,
          err?.body || err?.message || err,
        );
      }
    }),
  );
}
