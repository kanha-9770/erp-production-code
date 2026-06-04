import { PublicApplicationForm } from "@/components/careers/public-application-form";

export const dynamic = "force-dynamic";

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <PublicApplicationForm jobId={jobId} />;
}
