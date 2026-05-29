import { type NextRequest } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function GET(request: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const params = await props.params;
  return H.getModule(request, params.moduleId);
}

export async function PUT(request: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const params = await props.params;
  return H.updateModule(request, params.moduleId);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const params = await props.params;
  return H.deleteModuleById(request, params.moduleId);
}
