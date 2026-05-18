/**
 * Appointment Letter API Handlers
 *
 * Letters are derived from an accepted JobOffer (or directly from a
 * JobApplication). Most fields are snapshotted onto the letter so it stays
 * valid even if upstream records are deleted/anonymised.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { invalidatePayrollCache } from "@/lib/utils/payroll-live";
import { fireWorkflow } from "@/lib/workflow/static-triggers";

const STATUSES = ["DRAFT", "ISSUED", "SIGNED", "REVOKED"] as const;

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 },
    );
  return user;
}

async function handle(
  fn: () => Promise<NextResponse>,
  label: string,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[AppointmentLetterHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "Letter code already exists" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function sanitize(body: Record<string, any>, opts: { partial?: boolean } = {}) {
  const data: Record<string, any> = {};
  const partial = opts.partial ?? false;

  const strRequired = (key: string, target = key) => {
    if (!(key in body)) {
      if (!partial)
        throw NextResponse.json(
          { error: `${key} is required` },
          { status: 400 },
        );
      return;
    }
    const v = body[key];
    if (v === null || v === undefined || String(v).trim() === "")
      throw NextResponse.json({ error: `${key} is required` }, { status: 400 });
    data[target] = String(v).trim();
  };

  const strOptional = (key: string, target = key) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v === null || v === undefined || String(v).trim() === "") {
      data[target] = null;
      return;
    }
    data[target] = String(v).trim();
  };

  strRequired("applicantName");
  strOptional("applicantEmail");
  strOptional("company");
  strOptional("letterCode");
  strOptional("templateName");
  strOptional("title");
  strOptional("introduction");
  strOptional("description");
  strOptional("closingNotes");

  if (data.applicantEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.applicantEmail))
      throw NextResponse.json(
        { error: "Applicant email is not a valid address" },
        { status: 400 },
      );
  }

  if ("jobOfferId" in body) {
    const v = body.jobOfferId;
    data.jobOfferId =
      v === null || v === undefined || v === "" ? null : String(v);
  }
  if ("jobApplicationId" in body) {
    const v = body.jobApplicationId;
    data.jobApplicationId =
      v === null || v === undefined || v === "" ? null : String(v);
  }

  if ("appointmentDate" in body) {
    const v = body.appointmentDate;
    if (!v) {
      if (!partial)
        throw NextResponse.json(
          { error: "appointmentDate is required" },
          { status: 400 },
        );
      data.appointmentDate = null;
    } else {
      const d = new Date(v);
      if (Number.isNaN(d.getTime()))
        throw NextResponse.json(
          { error: "appointmentDate is not a valid date" },
          { status: 400 },
        );
      data.appointmentDate = d;
    }
  } else if (!partial) {
    throw NextResponse.json(
      { error: "appointmentDate is required" },
      { status: 400 },
    );
  }

  if ("signedDate" in body) {
    const v = body.signedDate;
    if (!v) {
      data.signedDate = null;
    } else {
      const d = new Date(v);
      data.signedDate = Number.isNaN(d.getTime()) ? null : d;
    }
  }

  if ("signed" in body) {
    data.signed = !!body.signed;
  }

  if ("status" in body) {
    const v = String(body.status || "").toUpperCase();
    data.status = STATUSES.includes(v as any) ? v : "DRAFT";
  } else if (!partial) {
    data.status = "DRAFT";
  }

  return data;
}

export const AppointmentLetterHandlers = {
  // GET /api/appointment-letters
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const letters = await (prisma as any).appointmentLetter.findMany({
        where: { organizationId: authUser.organizationId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          jobOffer: {
            select: { id: true, offerCode: true, status: true, offerDate: true },
          },
          jobApplication: {
            select: {
              id: true,
              applicantName: true,
              applicantEmail: true,
              applicationCode: true,
              status: true,
            },
          },
        },
      });
      return NextResponse.json({ success: true, letters });
    }, "list");
  },

  // POST /api/appointment-letters
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const data = sanitize(body);

      // If a Job Offer is linked, propagate its application automatically
      // unless the client overrode it. Validating org scoping at the same time.
      if (data.jobOfferId) {
        const off = await (prisma as any).jobOffer.findFirst({
          where: {
            id: data.jobOfferId,
            organizationId: authUser.organizationId,
          },
          select: { id: true, jobApplicationId: true },
        });
        if (!off) {
          return NextResponse.json(
            { error: "Selected job offer not found in this organization" },
            { status: 400 },
          );
        }
        if (!("jobApplicationId" in body))
          data.jobApplicationId = off.jobApplicationId ?? null;
      }
      if (data.jobApplicationId) {
        const app = await (prisma as any).jobApplication.findFirst({
          where: {
            id: data.jobApplicationId,
            organizationId: authUser.organizationId,
          },
          select: { id: true },
        });
        if (!app) {
          return NextResponse.json(
            { error: "Selected job application not found in this organization" },
            { status: 400 },
          );
        }
      }

      const letter = await (prisma as any).appointmentLetter.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          createdById: authUser.id,
        },
      });
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Appointment Letter",
          action: "Create",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: letter.id,
          recordData: letter as any,
        });
      }
      return NextResponse.json({ success: true, letter }, { status: 201 });
    }, "create");
  },

  // GET /api/appointment-letters/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const letter = await (prisma as any).appointmentLetter.findFirst({
        where: { id, organizationId: authUser.organizationId },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          jobOffer: {
            select: { id: true, offerCode: true, status: true, offerDate: true },
          },
          jobApplication: {
            select: {
              id: true,
              applicantName: true,
              applicantEmail: true,
              applicationCode: true,
              status: true,
            },
          },
        },
      });
      if (!letter)
        return NextResponse.json(
          { error: "Appointment letter not found" },
          { status: 404 },
        );
      return NextResponse.json({ success: true, letter });
    }, "get");
  },

  // PUT /api/appointment-letters/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();

      const existing = await (prisma as any).appointmentLetter.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true, status: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Appointment letter not found" },
          { status: 404 },
        );

      const data = sanitize(body, { partial: true });

      for (const [key, scope] of [
        ["jobOfferId", "jobOffer"],
        ["jobApplicationId", "jobApplication"],
      ] as const) {
        if (data[key]) {
          const row = await (prisma as any)[scope].findFirst({
            where: {
              id: data[key],
              organizationId: authUser.organizationId,
            },
            select: { id: true },
          });
          if (!row) {
            return NextResponse.json(
              { error: `Selected ${scope} not found in this organization` },
              { status: 400 },
            );
          }
        }
      }

      const letter = await (prisma as any).appointmentLetter.update({
        where: { id },
        data,
      });

      // Auto-onboarding: when the letter transitions into SIGNED, the
      // candidate has accepted — provision the Employee row so HR doesn't
      // have to retype the same details into Employee Master. Helper is
      // idempotent and swallows its own errors so a failure here can never
      // roll back a successful letter update.
      let autoCreatedEmployee:
        | { id: string; alreadyExisted?: boolean }
        | null = null;
      if (data.status === "SIGNED" && existing.status !== "SIGNED") {
        autoCreatedEmployee = await autoCreateEmployeeFromAppointmentLetter(
          id,
          { id: authUser.id, organizationId: authUser.organizationId! },
        );
      }

      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Appointment Letter",
          action: "Edit",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: letter.id,
          recordData: letter as any,
        });
      }

      return NextResponse.json({ success: true, letter, autoCreatedEmployee });
    }, "update");
  },

  // DELETE /api/appointment-letters/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).appointmentLetter.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Appointment letter not found" },
          { status: 404 },
        );
      await (prisma as any).appointmentLetter.delete({ where: { id } });
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Appointment Letter",
          action: "Delete",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: id,
          recordData: { id },
        });
      }
      return NextResponse.json({ success: true });
    }, "remove");
  },
};

// Provision an Employee row from a SIGNED appointment letter. Pulls
// department / designation / employmentType from the linked JobApplication
// (snapshot at apply-time) or the JobOpening (definitive source), and uses
// the same placeholder-User pattern as the manual createEmployee handler
// (see lib/api-handlers/user-management.ts:436) so the row is visible to
// admins of the creator's organization. Errors are logged and swallowed —
// the caller is the appointment-letter update path and must not be
// rolled back by an onboarding failure.
async function autoCreateEmployeeFromAppointmentLetter(
  letterId: string,
  authUser: { id: string; organizationId: string },
): Promise<{ id: string; alreadyExisted?: boolean } | null> {
  try {
    const letter = await (prisma as any).appointmentLetter.findFirst({
      where: { id: letterId, organizationId: authUser.organizationId },
      include: {
        jobOffer: {
          select: {
            applicantName: true,
            applicantEmail: true,
            jobOpening: {
              select: {
                department: true,
                designation: true,
                employmentType: true,
                salaryApprox: true,
              },
            },
          },
        },
        jobApplication: {
          select: {
            applicantName: true,
            applicantEmail: true,
            applicantMobile: true,
            department: true,
            designation: true,
            employmentType: true,
          },
        },
      },
    });
    if (!letter) return null;

    const name = String(
      letter.applicantName ||
        letter.jobOffer?.applicantName ||
        letter.jobApplication?.applicantName ||
        "",
    ).trim();
    const email =
      String(
        letter.applicantEmail ||
          letter.jobOffer?.applicantEmail ||
          letter.jobApplication?.applicantEmail ||
          "",
      ).trim() || null;

    // Idempotency. Toggling the status SIGNED → DRAFT → SIGNED, or running
    // two near-simultaneous PATCHes that both flip to SIGNED, must not
    // create duplicate Employee rows. Match on email within org first;
    // fall back to (name + joining date) for letters with no email.
    if (email) {
      const dup = await prisma.employee.findFirst({
        where: {
          emailAddress1: email,
          user: { organizationId: authUser.organizationId },
        },
        select: { id: true },
      });
      if (dup) return { id: dup.id, alreadyExisted: true };
    } else if (name && letter.appointmentDate) {
      const dup = await prisma.employee.findFirst({
        where: {
          employeeName: name,
          dateOfJoining: letter.appointmentDate,
          user: { organizationId: authUser.organizationId },
        },
        select: { id: true },
      });
      if (dup) return { id: dup.id, alreadyExisted: true };
    }

    const department =
      letter.jobApplication?.department ??
      letter.jobOffer?.jobOpening?.department ??
      null;
    const designation =
      letter.jobApplication?.designation ??
      letter.jobOffer?.jobOpening?.designation ??
      null;
    const employmentType =
      letter.jobApplication?.employmentType ??
      letter.jobOffer?.jobOpening?.employmentType ??
      null;
    const personalContact = letter.jobApplication?.applicantMobile ?? null;

    const nameParts = name.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || null;

    // Same User-attachment dance as createEmployee: Employee has no org
    // column of its own, so the row is only visible to the admin list query
    // if it's linked to a User in the right org. Reuse the candidate's User
    // if one already exists in this org and is free; otherwise mint a
    // placeholder so the row lands without colliding with User.email's
    // unique constraint or Employee.userId's unique constraint.
    const candidateEmail =
      email ||
      `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.local`;

    const existingUser = await prisma.user.findUnique({
      where: { email: candidateEmail },
      select: { id: true, organizationId: true },
    });

    let userId: string;
    if (
      existingUser &&
      existingUser.organizationId === authUser.organizationId
    ) {
      const taken = await prisma.employee.findUnique({
        where: { userId: existingUser.id },
        select: { id: true },
      });
      if (taken) {
        const u = await prisma.user.create({
          data: {
            email: `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.local`,
            organizationId: authUser.organizationId,
            status: "ACTIVE",
            email_verified: true,
            first_name: firstName,
            last_name: lastName,
          },
        });
        userId = u.id;
      } else {
        userId = existingUser.id;
      }
    } else {
      const safeEmail = existingUser
        ? `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.local`
        : candidateEmail;
      const u = await prisma.user.create({
        data: {
          email: safeEmail,
          organizationId: authUser.organizationId,
          status: "ACTIVE",
          email_verified: true,
          first_name: firstName,
          last_name: lastName,
        },
      });
      userId = u.id;
    }

    const employee = await prisma.employee.create({
      data: {
        userId,
        employeeName: name || "Unnamed",
        firstName: firstName || null,
        lastName,
        emailAddress1: email,
        personalContact,
        dateOfJoining: letter.appointmentDate,
        companyName: letter.company ?? null,
        department,
        designation,
        employmentType: employmentType ?? null,
        status: "ACTIVE",
      },
    });

    // New Employee → drop the live payroll cache so they appear in the
    // dashboard on the next fetch instead of waiting for the 5s TTL.
    invalidatePayrollCache(authUser.organizationId);

    return { id: employee.id };
  } catch (err: any) {
    console.error(
      "[AppointmentLetterHandlers] auto-create employee failed:",
      err?.message,
    );
    return null;
  }
}
