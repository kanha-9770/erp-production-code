import { Suspense } from "react";
import { OrganizationSetup } from "@/components/settings/organization-setup/organization-setup";

export const dynamic = "force-dynamic";

export default function OrganizationSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-muted/30 dark:bg-gray-950" />}>
      <OrganizationSetup />
    </Suspense>
  );
}
