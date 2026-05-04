import { TeamAttendance } from "@/components/attendance/team-attendance";

export const dynamic = "force-dynamic";

export default function TeamAttendancePage() {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Team Attendance
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Org-wide attendance for the selected day or range. Admin only.
          Click any row to see the proof photos and full punch metadata.
        </p>
      </div>
      <TeamAttendance />
    </div>
  );
}
