import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // Assuming this is your Prisma client import
import { getRolesByOrganization, createRole } from "@/lib/database/roles"; // Adjust path if needed

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const organizationId = params.id;
    const roles = await getRolesByOrganization(organizationId);
    return NextResponse.json(roles);
  } catch (error: any) {
    console.error("Error fetching roles:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch roles" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const organizationId = params.id;
    const data = await request.json();
    // Basic validation
    if (!data.name) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    }
    // Check if organization exists (redundant with createRole, but early fail)
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      return NextResponse.json({ error: `Organization with id ${organizationId} not found` }, { status: 404 });
    }
    const role = await createRole({ ...data, organizationId });
    return NextResponse.json(role, { status: 201 });
  } catch (error: any) {
    console.error("Error creating role:", error);
    const message: string = error?.message || "Failed to create role";
    // Map the (now meaningful) error message to an appropriate HTTP status.
    let status = 500;
    if (message.includes("already exists")) status = 409; // duplicate name
    else if (message.includes("not found") || message.includes("no longer exists")) status = 404;
    else if (message.includes("different organization") || message.includes("Invalid reference")) status = 400;
    // Return both `error` and `message` so any client shape can read the reason.
    return NextResponse.json({ error: message, message }, { status });
  }
}