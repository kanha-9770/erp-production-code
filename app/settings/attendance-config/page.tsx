import { AttendanceConfigForm } from "@/components/attendance/attendance-config-form";
import { IntegrationsCard } from "@/components/attendance/integrations-card";

export const dynamic = "force-dynamic";

export default function AttendanceConfigPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Attendance Configuration
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Shift, working-week, geofence and auto-checkout settings. Used by
          the attendance widget and read by the payroll engine, so any
          change here applies consistently across both.
        </p>
      </div>
      {/* Linked forms first — without these, holiday/leave detection in the
          widget and the same in payroll both stay empty. */}
      <IntegrationsCard />
      <AttendanceConfigForm />
    </div>
  );
}
