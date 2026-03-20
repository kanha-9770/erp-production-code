import { type NextRequest } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function GET(request: NextRequest) {
  return H.getModules(request);
}

export async function POST(request: NextRequest) {
  return H.createModule(request);
}

export async function DELETE(request: NextRequest) {
  return H.deleteModule(request);
}
