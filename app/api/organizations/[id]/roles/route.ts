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
    if (error.message?.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}