import { DynamicMasters } from "@/components/masters/dynamic-masters";
import PageBackLink from "@/components/shared/page-back-link";

export default async function MastersPage() {
  return (
    <div className="h-full bg-gray-50/60">
      <div className="px-4 pt-4 sm:px-6 lg:px-8">
        <PageBackLink href="/settings" label="Settings" />
      </div>
      <DynamicMasters />
    </div>
  )
}
