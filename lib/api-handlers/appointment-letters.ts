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
        select: { id: true },
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
      return NextResponse.json({ success: true, letter });
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
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
