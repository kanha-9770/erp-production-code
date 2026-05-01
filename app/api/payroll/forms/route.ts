export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

// GET - Fetch all forms for payroll configuration
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not a member of any organization" },
        { status: 403 },
      );
    }

    // Only return published forms whose module belongs to the caller's org.
    // Without this filter the configure page used to show every tenant's forms.
    const forms = await prisma.form.findMany({
      where: {
        isPublished: true,
        module: { organizationId: authUser.organizationId },
      },
      include: {
        module: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ module: { name: "asc" } }, { name: "asc" }],
    });

    return NextResponse.json({
      success: true,
      forms: forms.map((form) => ({
        id: form.id,
        name: form.name,
        description: form.description,
        module: {
          name: form.module.name,
        },
      })),
    });
  } catch (error) {
    console.error("[v0] Error fetching forms:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch forms" },
      { status: 500 }
    );
  }
}
