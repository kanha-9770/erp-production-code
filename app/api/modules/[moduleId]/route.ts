import { type NextRequest } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function GET(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  return H.getModule(request, params.moduleId);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  return H.updateModule(request, params.moduleId);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  return H.deleteModuleById(request, params.moduleId);
}
