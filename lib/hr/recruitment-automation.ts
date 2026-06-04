/**
 * Recruitment automation — drives the hiring pipeline forward on status
 * changes, mirroring the existing HR lifecycle pattern (idempotent, best-effort,
 * never blocks the request that triggered it):
 *
 *   Application created            → notify recruiters + acknowledge to candidate
 *   Application → SHORTLISTED       → email candidate
 *   Application → REJECTED          → email candidate (polite)
 *   Application → OFFERED           → auto-create a DRAFT Job Offer (idempotent)
 *   Offer → SENT                    → email candidate the offer is on its way
 *   Offer → ACCEPTED                → auto-create a DRAFT Appointment Letter
 *   Appointment Letter → SIGNED     → (existing) creates Employee + Onboarding
 *
 * All functions catch their own errors and log; callers fire-and-forget with
 * `void fn().catch(...)` so a notification/email hiccup never fails the API.
 */

import { prisma } from "@/lib/prisma";
import { sendWorkflowEmail } from "@/lib/email";

const db = prisma as any;

type Json = Record<string, any>;

async function orgName(organizationId: string): Promise<string> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    return org?.name?.trim() || "Our Company";
  } catch {
    return "Our Company";
  }
}

/** In-app notification fan-out to the org's admins. */
async function notifyOrgAdmins(
  organizationId: string,
  n: { title: string; body?: string; link?: string; moduleName?: string; recordId?: string },
): Promise<void> {
  try {
    const adminRoles = await prisma.role.findMany({
      where: { organizationId, isAdmin: true },
      select: { id: true },
    });
    if (adminRoles.length === 0) return;
    const assignments = await prisma.userUnitAssignment.findMany({
      where: { roleId: { in: adminRoles.map((r) => r.id) } },
      select: { userId: true },
    });
    const recipientIds = Array.from(new Set(assignments.map((a) => a.userId)));
    if (recipientIds.length === 0) return;
    await db.notification.createMany({
      data: recipientIds.map((rid) => ({
        recipientId: rid,
        organizationId,
        title: n.title,
        body: n.body ?? null,
        moduleName: n.moduleName ?? "Recruitment",
        recordId: n.recordId ?? null,
        link: n.link ?? null,
      })),
    });
  } catch (err) {
    console.error("[recruitment-automation] notifyOrgAdmins:", err);
  }
}

async function emailCandidate(
  to: string | null | undefined,
  subject: string,
  body: string,
): Promise<void> {
  if (!to) return;
  try {
    await sendWorkflowEmail({ to, subject, body });
  } catch (err) {
    console.error("[recruitment-automation] emailCandidate:", err);
  }
}

/** New application arrived (from the public form or an internal create). */
export async function onApplicationCreated(
  application: Json,
  organizationId: string,
): Promise<void> {
  const role = application.designation || application.department || "the role";
  await notifyOrgAdmins(organizationId, {
    title: `New application: ${application.applicantName}`,
    body: `${application.applicantName} applied for ${role}. Review it in Job Applications.`,
    moduleName: "Job Application",
    recordId: application.id,
    link: "/hr/recruitment/job-application",
  });

  const company = await orgName(organizationId);
  await emailCandidate(
    application.applicantEmail,
    `We received your application — ${company}`,
    `Hi ${application.applicantName},\n\n` +
      `Thank you for applying${application.designation ? ` for the ${application.designation} role` : ""} at ${company}. ` +
      `Our team has received your application and will review it shortly. ` +
      `We'll reach out with the next steps.\n\n` +
      `Best regards,\n${company} Hiring Team`,
  );
}

/**
 * Candidate-facing email for each application status. Keyed by the status the
 * application MOVES INTO. Returning null means "no email for this transition"
 * (e.g. NEW is handled at creation time by onApplicationCreated). Each builder
 * gets the application row + the resolved company name and returns the subject
 * and plain-text body. Keeping every template in one map makes it trivial to
 * see — and tweak — exactly what the candidate receives at each step.
 */
const APPLICATION_STATUS_EMAIL: Record<
  string,
  ((a: Json, company: string) => { subject: string; body: string }) | null
> = {
  // Acknowledgement is sent by onApplicationCreated, not here.
  NEW: null,

  SCREENING: (a, company) => ({
    subject: `Your application is under review — ${company}`,
    body:
      `Hi ${a.applicantName},\n\n` +
      `Thanks again for applying${a.designation ? ` for the ${a.designation} role` : ""} at ${company}. ` +
      `Your application is now being reviewed by our hiring team. ` +
      `We'll be in touch with the next steps shortly.\n\n` +
      `Best regards,\n${company} Hiring Team`,
  }),

  INTERVIEWING: (a, company) => ({
    subject: `You're invited to interview — ${company}`,
    body:
      `Hi ${a.applicantName},\n\n` +
      `Great news! We'd like to move your application${a.designation ? ` for ${a.designation}` : ""} forward to the interview stage at ${company}. ` +
      `A member of our team will reach out to schedule a convenient time with you.\n\n` +
      `Looking forward to speaking with you,\n${company} Hiring Team`,
  }),

  SHORTLISTED: (a, company) => ({
    subject: `You've been shortlisted — ${company}`,
    body:
      `Hi ${a.applicantName},\n\n` +
      `Good news! Your application${a.designation ? ` for ${a.designation}` : ""} has been shortlisted at ${company}. ` +
      `Our team will contact you soon to schedule the next steps.\n\n` +
      `Best regards,\n${company} Hiring Team`,
  }),

  OFFERED: (a, company) => ({
    subject: `Good news about your application — ${company}`,
    body:
      `Hi ${a.applicantName},\n\n` +
      `We're excited to let you know that we're preparing an offer for you${a.designation ? ` for the ${a.designation} role` : ""} at ${company}. ` +
      `You'll receive the full details from us very shortly.\n\n` +
      `Congratulations,\n${company} Hiring Team`,
  }),

  HIRED: (a, company) => ({
    subject: `Welcome to ${company}!`,
    body:
      `Hi ${a.applicantName},\n\n` +
      `Congratulations and welcome aboard! We're thrilled to have you join ${company}${a.designation ? ` as ${a.designation}` : ""}. ` +
      `Our team will share your onboarding details and next steps soon.\n\n` +
      `Warm welcome,\n${company} Hiring Team`,
  }),

  ON_HOLD: (a, company) => ({
    subject: `Update on your application — ${company}`,
    body:
      `Hi ${a.applicantName},\n\n` +
      `Thank you for your patience. Your application${a.designation ? ` for ${a.designation}` : ""} at ${company} is currently on hold while we finalise some details on our side. ` +
      `We'll reach out as soon as we have an update.\n\n` +
      `Best regards,\n${company} Hiring Team`,
  }),

  REJECTED: (a, company) => ({
    subject: `Update on your application — ${company}`,
    body:
      `Hi ${a.applicantName},\n\n` +
      `Thank you for your interest in ${company} and for the time you invested in your application. ` +
      `After careful consideration, we've decided to move forward with other candidates at this time. ` +
      `We wish you the very best and encourage you to apply for future openings.\n\n` +
      `Warm regards,\n${company} Hiring Team`,
  }),

  WITHDRAWN: (a, company) => ({
    subject: `Your application has been withdrawn — ${company}`,
    body:
      `Hi ${a.applicantName},\n\n` +
      `This is to confirm that your application${a.designation ? ` for ${a.designation}` : ""} at ${company} has been withdrawn. ` +
      `If this wasn't your intention, or you'd like to apply again in the future, we'd be glad to hear from you.\n\n` +
      `Best regards,\n${company} Hiring Team`,
  }),
};

/** Application status changed. */
export async function onApplicationStatusChanged(opts: {
  application: Json;
  prevStatus: string | null | undefined;
  organizationId: string;
  userId?: string | null;
}): Promise<void> {
  const { application, prevStatus, organizationId, userId } = opts;
  const status = application.status as string;
  if (!status || status === prevStatus) return;
  const company = await orgName(organizationId);

  try {
    // Send the candidate the email for this status, if one is defined.
    const template = APPLICATION_STATUS_EMAIL[status];
    if (template) {
      const { subject, body } = template(application, company);
      await emailCandidate(application.applicantEmail, subject, body);
    }

    // Side effect: moving to OFFERED auto-drafts a Job Offer (idempotent).
    if (status === "OFFERED") {
      await ensureOfferForApplication(application, organizationId, userId);
    }
  } catch (err) {
    console.error("[recruitment-automation] onApplicationStatusChanged:", err);
  }
}

/** Create a DRAFT Job Offer for an application if one doesn't exist yet. */
async function ensureOfferForApplication(
  application: Json,
  organizationId: string,
  userId?: string | null,
): Promise<string> {
  const existing = await db.jobOffer.findFirst({
    where: { jobApplicationId: application.id, organizationId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const offer = await db.jobOffer.create({
    data: {
      applicantName: application.applicantName,
      applicantEmail: application.applicantEmail ?? null,
      offerDate: new Date(),
      status: "DRAFT",
      jobApplicationId: application.id,
      jobOpeningId: application.jobOpeningId ?? null,
      staffingPlanId: application.staffingPlanId ?? null,
      organizationId,
      createdById: userId ?? null,
    },
  });

  await notifyOrgAdmins(organizationId, {
    title: `Draft offer ready: ${application.applicantName}`,
    body: `A draft job offer was auto-created. Review the terms and send it.`,
    moduleName: "Job Offer",
    recordId: offer.id,
    link: "/hr/recruitment/job-offer",
  });
  return offer.id;
}

/**
 * Candidate-facing email for each offer status. Keyed by the status the offer
 * MOVES INTO. DRAFT is intentionally silent (the offer is still internal).
 */
const OFFER_STATUS_EMAIL: Record<
  string,
  ((o: Json, company: string) => { subject: string; body: string }) | null
> = {
  // A draft offer is internal-only — don't email the candidate yet.
  DRAFT: null,

  SENT: (o, company) => ({
    subject: `Your offer from ${company}`,
    body:
      `Hi ${o.applicantName},\n\n` +
      `We're delighted to extend an offer to you at ${company}. ` +
      `Our team will share the full details with you shortly. ` +
      `Please review and let us know if you have any questions.\n\n` +
      `Best regards,\n${company} Hiring Team`,
  }),

  ACCEPTED: (o, company) => ({
    subject: `Thank you for accepting your offer — ${company}`,
    body:
      `Hi ${o.applicantName},\n\n` +
      `Wonderful news — thank you for accepting our offer! We're excited to welcome you to ${company}. ` +
      `We're preparing your appointment letter and onboarding details, and will be in touch with the next steps soon.\n\n` +
      `Warm welcome,\n${company} Hiring Team`,
  }),

  REJECTED: (o, company) => ({
    subject: `We received your response — ${company}`,
    body:
      `Hi ${o.applicantName},\n\n` +
      `Thank you for letting us know your decision regarding our offer at ${company}. ` +
      `While we're sorry it didn't work out this time, we genuinely wish you all the best and hope our paths cross again.\n\n` +
      `Warm regards,\n${company} Hiring Team`,
  }),

  WITHDRAWN: (o, company) => ({
    subject: `Update regarding your offer — ${company}`,
    body:
      `Hi ${o.applicantName},\n\n` +
      `We're writing to let you know that the offer previously extended to you at ${company} has been withdrawn. ` +
      `If you have any questions, please don't hesitate to reach out to us.\n\n` +
      `Best regards,\n${company} Hiring Team`,
  }),

  EXPIRED: (o, company) => ({
    subject: `Your offer has expired — ${company}`,
    body:
      `Hi ${o.applicantName},\n\n` +
      `The offer we extended to you at ${company} has now expired as we hadn't received a response by the deadline. ` +
      `If you're still interested, please get in touch — we'd be happy to talk.\n\n` +
      `Best regards,\n${company} Hiring Team`,
  }),
};

/** Offer status changed. */
export async function onOfferStatusChanged(opts: {
  offer: Json;
  prevStatus: string | null | undefined;
  organizationId: string;
  userId?: string | null;
}): Promise<void> {
  const { offer, prevStatus, organizationId, userId } = opts;
  const status = offer.status as string;
  if (!status || status === prevStatus) return;
  const company = await orgName(organizationId);

  try {
    // Send the candidate the email for this offer status, if one is defined.
    const template = OFFER_STATUS_EMAIL[status];
    if (template) {
      const { subject, body } = template(offer, company);
      await emailCandidate(offer.applicantEmail, subject, body);
    }

    // Side effect: accepting the offer auto-drafts an Appointment Letter.
    if (status === "ACCEPTED") {
      await ensureAppointmentLetterForOffer(offer, organizationId, userId);
    }
  } catch (err) {
    console.error("[recruitment-automation] onOfferStatusChanged:", err);
  }
}

/** Create a DRAFT Appointment Letter for an accepted offer if none exists. */
async function ensureAppointmentLetterForOffer(
  offer: Json,
  organizationId: string,
  userId?: string | null,
): Promise<string> {
  const existing = await db.appointmentLetter.findFirst({
    where: { jobOfferId: offer.id, organizationId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const company = await orgName(organizationId);
  const letter = await db.appointmentLetter.create({
    data: {
      applicantName: offer.applicantName,
      applicantEmail: offer.applicantEmail ?? null,
      company,
      appointmentDate: new Date(),
      status: "DRAFT",
      jobOfferId: offer.id,
      jobApplicationId: offer.jobApplicationId ?? null,
      organizationId,
      createdById: userId ?? null,
    },
  });

  await notifyOrgAdmins(organizationId, {
    title: `Appointment letter drafted: ${offer.applicantName}`,
    body: `The offer was accepted — a draft appointment letter was auto-created. Review, issue, and get it signed (signing creates the employee + onboarding).`,
    moduleName: "Appointment Letter",
    recordId: letter.id,
    link: "/hr/recruitment/appointment-letter",
  });
  return letter.id;
}
