import { MyAttendance } from "@/components/attendance/my-attendance";

export const dynamic = "force-dynamic";

export default function AttendanceHistoryPage() {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          My Attendance
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Your check-in / check-out history with proof photos and location.
          Range defaults to the last 30 days; pick any window up to a year.
        </p>
      </div>
      <MyAttendance />
    </div>
  );
}
