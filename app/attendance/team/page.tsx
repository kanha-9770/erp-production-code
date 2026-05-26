import { TeamAttendance } from "@/components/attendance/team-attendance";
import PageBackLink from "@/components/shared/page-back-link";

export const dynamic = "force-dynamic";

export default function TeamAttendancePage() {
  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 lg:p-6">
      <div className="mb-3 sm:mb-4 space-y-1">
        <PageBackLink href="/attendance" label="Attendance" />
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-gray-900">
          Team Attendance
        </h1>
      </div>
      <TeamAttendance />
    </div>
  );
}
