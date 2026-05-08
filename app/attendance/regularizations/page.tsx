import { RegularizationsList } from "@/components/attendance/regularizations-list";
import PageBackLink from "@/components/shared/page-back-link";

export const dynamic = "force-dynamic";

export default function RegularizationsPage() {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 space-y-1.5">
        <PageBackLink href="/attendance" label="Attendance" />
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Regularizations
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Request a correction to a missed or wrong punch. Admins approve or
          reject; approval applies the change to the Attendance row and fires
          audit log + workflow rules.
        </p>
      </div>
      <RegularizationsList />
    </div>
  );
}
