"use client"

/**
 * In-app notification chime. Synthesized with the Web Audio API so no asset
 * needs shipping and the sound plays even offline. Called whenever a new
 * notification arrives while the tab is open (see notification-bell.tsx).
 *
 * Two notes are scheduled back-to-back: a clean rising "ding-ding" that
 * cuts through ambient noise without being obnoxious. Total length ~300ms.
 *
 * Browsers block audio playback until the user has interacted with the
 * page at least once (autoplay policy). `ensureAlertSoundUnlock` arms a
 * one-time global listener that resumes the AudioContext on first click /
 * keypress / tap so the very next notification can play immediately.
 */

let ctx: AudioContext | null = null
let unlockBound = false

// Per-device mute preference. Persisted to localStorage so it survives reloads
// without needing a backend column. Defaults to unmuted (sound on).
const MUTE_KEY = "notifications.sound.muted.v1"

export function isAlertSoundMuted(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(MUTE_KEY) === "1"
  } catch {
    return false
  }
}

export function setAlertSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1")
    else localStorage.removeItem(MUTE_KEY)
  } catch {
    /* storage unavailable (private mode / quota) — ignore */
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (ctx) return ctx
  try {
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  } catch {
    return null
  }
  return ctx
}

export function ensureAlertSoundUnlock(): void {
  if (unlockBound || typeof window === "undefined") return
  unlockBound = true
  const unlock = () => {
    const ac = getCtx()
    if (ac && ac.state === "suspended") {
      ac.resume().catch(() => {})
    }
    document.removeEventListener("click", unlock)
    document.removeEventListener("keydown", unlock)
    document.removeEventListener("touchstart", unlock)
  }
  document.addEventListener("click", unlock, { once: true, passive: true })
  document.addEventListener("keydown", unlock, { once: true })
  document.addEventListener("touchstart", unlock, { once: true, passive: true })
}

export function playNotificationSound(): void {
  // Respect the user's per-device mute toggle.
  if (isAlertSoundMuted()) return
  const ac = getCtx()
  if (!ac) return
  if (ac.state === "suspended") {
    ac.resume().catch(() => {})
  }
  if (ac.state !== "running") return

  const now = ac.currentTime

  const beep = (freq: number, startOffset: number, duration: number) => {
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = "sine"
    o.frequency.setValueAtTime(freq, now + startOffset)
    o.connect(g)
    g.connect(ac.destination)
    g.gain.setValueAtTime(0.0001, now + startOffset)
    g.gain.exponentialRampToValueAtTime(0.22, now + startOffset + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration)
    o.start(now + startOffset)
    o.stop(now + startOffset + duration + 0.02)
  }

  beep(880, 0, 0.14) // A5
  beep(1318.5, 0.12, 0.18) // E6 — rising fifth-ish, sounds like "ding-ding"
}
