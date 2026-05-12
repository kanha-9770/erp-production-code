/**
 * Employee Referral API Handlers
 *
 * A referral has a hard link to the referring Employee — you can't refer
 * someone if you don't work here. The applicant is captured as a snapshot;
 * they become a JobApplication / User only after recruitment progresses.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

const STATUSES = [
  "NEW",
  "REVIEWED",
  "INTERVIEWING",
  "HIRED",
  "REJECTED",
] as const;

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
    console.error(`[EmployeeReferralHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "Referral code already exists" },
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
  strRequired("applicantEmail");
  strRequired("applicantMobile");
  strRequired("referringEmployeeId");
  strRequired("referrerFirstName");

  strOptional("referralCode");
  strOptional("applicantResumeUrl");
  strOptional("applicantResumeName");
  strOptional("designation");
  strOptional("referrerDepartment");
  strOptional("remark");

  if (data.applicantEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.applicantEmail))
      throw NextResponse.json(
        { error: "Applicant email is not a valid address" },
        { status: 400 },
      );
  }

  if ("referralDate" in body) {
    const v = body.referralDate;
    if (!v) {
      if (!partial)
        throw NextResponse.json(
          { error: "referralDate is required" },
          { status: 400 },
        );
      data.referralDate = null;
    } else {
      const d = new Date(v);
      if (Number.isNaN(d.getTime()))
        throw NextResponse.json(
          { error: "referralDate is not a valid date" },
          { status: 400 },
        );
      data.referralDate = d;
    }
  } else if (!partial) {
    throw NextResponse.json(
      { error: "referralDate is required" },
      { status: 400 },
    );
  }

  if ("status" in body) {
    const v = String(body.status || "").toUpperCase();
    data.status = STATUSES.includes(v as any) ? v : "NEW";
  } else if (!partial) {
    data.status = "NEW";
  }

  return data;
}

export const EmployeeReferralHandlers = {
  // GET /api/employee-referrals
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const referrals = await (prisma as any).employeeReferral.findMany({
        where: { organizationId: authUser.organizationId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          referringEmployee: {
            select: {
              id: true,
              employeeName: true,
              department: true,
              designation: true,
              emailAddress1: true,
            },
          },
        },
      });
      return NextResponse.json({ success: true, referrals });
    }, "list");
  },

  // POST /api/employee-referrals
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const data = sanitize(body);

      // Verify referring employee belongs to the same org (via user link or
      // unaffiliated for org-less employees). Reject cross-tenant employees.
      const emp = await prisma.employee.findFirst({
        where: {
          id: data.referringEmployeeId,
          OR: [
            { user: { organizationId: authUser.organizationId } },
            { userId: null },
          ],
        },
        select: { id: true },
      });
      if (!emp) {
        return NextResponse.json(
          { error: "Referring employee not found in this organization" },
          { status: 400 },
        );
      }

      const referral = await (prisma as any).employeeReferral.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          createdById: authUser.id,
        },
      });
      return NextResponse.json({ success: true, referral }, { status: 201 });
    }, "create");
  },

  // GET /api/employee-referrals/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const referral = await (prisma as any).employeeReferral.findFirst({
        where: { id, organizationId: authUser.organizationId },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          referringEmployee: {
            select: {
              id: true,
              employeeName: true,
              department: true,
              designation: true,
              emailAddress1: true,
            },
          },
        },
      });
      if (!referral)
        return NextResponse.json(
          { error: "Referral not found" },
          { status: 404 },
        );
      return NextResponse.json({ success: true, referral });
    }, "get");
  },

  // PUT /api/employee-referrals/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();

      const existing = await (prisma as any).employeeReferral.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Referral not found" },
          { status: 404 },
        );

      const data = sanitize(body, { partial: true });

      if (data.referringEmployeeId) {
        const emp = await prisma.employee.findFirst({
          where: {
            id: data.referringEmployeeId,
            OR: [
              { user: { organizationId: authUser.organizationId } },
              { userId: null },
            ],
          },
          select: { id: true },
        });
        if (!emp) {
          return NextResponse.json(
            { error: "Referring employee not found in this organization" },
            { status: 400 },
          );
        }
      }

      const referral = await (prisma as any).employeeReferral.update({
        where: { id },
        data,
      });
      return NextResponse.json({ success: true, referral });
    }, "update");
  },

  // DELETE /api/employee-referrals/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).employeeReferral.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Referral not found" },
          { status: 404 },
        );
      await (prisma as any).employeeReferral.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
