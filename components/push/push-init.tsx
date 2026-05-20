"use client";

/**
 * PushInit — mounted once near the app root. On first render it:
 *
 *   1. Bails out if the browser doesn't support Service Workers / Push.
 *   2. Registers `/sw.js` (idempotent — the browser dedupes by URL).
 *   3. Fetches the VAPID public key from the server.
 *   4. If the user already granted permission, makes sure there's a live
 *      subscription stored on the backend (cheap upsert keyed on endpoint).
 *      We do NOT auto-prompt — `Notification.requestPermission()` should
 *      always be triggered from a user gesture, so the actual prompt lives
 *      in the bell-icon UI / a "Enable notifications" button.
 *
 * The component renders nothing — it's purely a side-effect host.
 */

import { useEffect } from "react";

async function ensureSubscription() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.warn("[push] service-worker registration failed:", err);
    return;
  }

  // Only push the subscription if the user has already granted permission.
  // The first-time prompt is owned by the UI button so it always fires from
  // a real click — Chrome and Safari both reject prompts triggered outside
  // a user gesture.
  if (Notification.permission !== "granted") return;

  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await sendSubscriptionToServer(existing);
      return;
    }
    const keyRes = await fetch("/api/push/vapid-public-key");
    if (!keyRes.ok) return;
    const { key } = await keyRes.json();
    if (!key) return;
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await sendSubscriptionToServer(sub);
  } catch (err) {
    console.warn("[push] subscription enrol failed:", err);
  }
}

async function sendSubscriptionToServer(sub: PushSubscription) {
  const body = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // VAPID keys are base64url with no padding; the Push API wants a raw
  // Uint8Array of the underlying bytes. This is the reference conversion
  // from the spec.
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Triggered from a user gesture (e.g. a "Enable notifications" button). Asks
 * for permission, subscribes, and persists. Returns the final permission
 * state so callers can toast success/failure.
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined") return "default";
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") {
    await ensureSubscription();
    return "granted";
  }
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  if (result === "granted") await ensureSubscription();
  return result;
}

export default function PushInit() {
  useEffect(() => {
    void ensureSubscription();
  }, []);
  return null;
}
