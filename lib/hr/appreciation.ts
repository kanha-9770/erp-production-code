/**
 * Appreciation notifications — fun, varied, Zomato-style copy plus a single
 * helper that fans a message out to a user via BOTH channels (in-app bell row
 * + phone web-push). Centralised so every event (leave, onboarding, payroll,
 * milestones…) sends consistent, delightful messages with one call.
 *
 * Copy is intentionally playful and rotates between variants so a user who
 * triggers the same event repeatedly doesn't see identical text every time.
 */

import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push/server";

export interface AppreciationMessage {
  title: string;
  body: string;
}

// Deterministic-but-varied pick: rotates by a seed (e.g. record id length +
// day) so the same event id is stable within a render but the pool still
// varies across different events/days. Avoids Math.random (keeps it testable).
function pick<T>(arr: T[], seed: number): T {
  if (arr.length === 0) throw new Error("pick: empty array");
  const i = Math.abs(Math.floor(seed)) % arr.length;
  return arr[i];
}

function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// First name from a full name (for personalised copy). Falls back to a warm
// generic when we don't have a name.
function firstNameOf(fullName?: string | null): string {
  const n = (fullName ?? "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
}

/** Leave approved — celebratory. */
export function leaveApprovedMessage(opts: {
  name?: string | null;
  leaveType?: string | null;
  seedKey: string;
}): AppreciationMessage {
  const who = firstNameOf(opts.name);
  const kind = opts.leaveType ? `${opts.leaveType} ` : "";
  const titles = [
    `🎉 Leave approved, ${who}!`,
    `✅ You're all set, ${who}!`,
    `🌴 Approved — time to unwind!`,
  ];
  const bodies = [
    `Your ${kind}leave is approved. Go recharge — you've earned it! 🙌`,
    `Good news! Your ${kind}leave just got the green light. Enjoy every minute. 🏖️`,
    `Bags packed? Your ${kind}leave is approved. Out-of-office mode: ON. ✈️`,
  ];
  const seed = seedFrom(opts.seedKey);
  return { title: pick(titles, seed), body: pick(bodies, seed + 1) };
}

/** Leave rejected — kind and non-scolding. */
export function leaveRejectedMessage(opts: {
  name?: string | null;
  note?: string | null;
  seedKey: string;
}): AppreciationMessage {
  const who = firstNameOf(opts.name);
  const reason = opts.note?.trim() ? ` Note: ${opts.note.trim()}` : "";
  return {
    title: `Leave update, ${who}`,
    body: `Your leave request wasn't approved this time.${reason} Reach out to your manager if you have questions. 🤝`,
  };
}

/** Onboarding complete — warm welcome. */
export function onboardingCompleteMessage(opts: {
  name?: string | null;
  seedKey: string;
}): AppreciationMessage {
  const who = firstNameOf(opts.name);
  const titles = [
    `🎊 Welcome aboard, ${who}!`,
    `🚀 You're all set, ${who}!`,
    `🌟 Onboarding complete!`,
  ];
  const bodies = [
    `Your onboarding is done — welcome to the team! Let's build great things together. 💪`,
    `All set up and ready to roll. So glad to have you with us! 🙌`,
    `Welcome aboard! Your checklist is complete. Here's to an amazing journey ahead. ✨`,
  ];
  const seed = seedFrom(opts.seedKey);
  return { title: pick(titles, seed), body: pick(bodies, seed + 1) };
}

/** Salary credited / payslip ready — payday hype. */
export function payslipReadyMessage(opts: {
  name?: string | null;
  period?: string | null;
  seedKey: string;
}): AppreciationMessage {
  const who = firstNameOf(opts.name);
  const period = opts.period ? ` for ${opts.period}` : "";
  const titles = [`💰 Payday, ${who}! 🎉`, `🤑 Cha-ching!`, `📄 Payslip ready!`];
  const bodies = [
    `Your salary${period} just landed. Treat yourself — you earned it! 🎊`,
    `Money in! Your payslip${period} is ready to view. 💸`,
    `Another month, another win. Your payslip${period} is in. 🙌`,
  ];
  const seed = seedFrom(opts.seedKey);
  return { title: pick(titles, seed), body: pick(bodies, seed + 1) };
}

/**
 * Send an appreciation message to one user via BOTH channels: an in-app
 * Notification row (the bell) and a web-push (the phone popup). Fire-and-
 * forget friendly — the caller can `void` it. Never throws; logs and moves on
 * so a notification hiccup can't break the action that triggered it.
 */
export async function notifyUserAppreciation(
  userId: string,
  organizationId: string | null,
  msg: AppreciationMessage,
  opts?: { url?: string; moduleName?: string; tag?: string },
): Promise<void> {
  if (!userId) return;
  const url = opts?.url ?? "/";
  try {
    await (prisma as any).notification.create({
      data: {
        recipientId: userId,
        organizationId,
        title: msg.title,
        body: msg.body,
        moduleName: opts?.moduleName ?? null,
        link: url,
      },
    });
  } catch (err: any) {
    const m = String(err?.message || err || "");
    // Stale-client fallback: retry without optional columns it may not know.
    if (m.includes("Unknown arg") || m.includes("Unknown argument")) {
      try {
        await (prisma as any).notification.create({
          data: {
            recipientId: userId,
            organizationId,
            title: msg.title,
            body: msg.body,
          },
        });
      } catch (e: any) {
        console.warn("[appreciation] in-app notify failed:", e?.message || e);
      }
    } else {
      console.warn("[appreciation] in-app notify failed:", err?.message || err);
    }
  }
  void sendPushToUsers([userId], {
    title: msg.title,
    body: msg.body,
    url,
    tag: opts?.tag,
  }).catch(() => {});
}
