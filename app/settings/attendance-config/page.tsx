import { AttendanceConfigForm } from "@/components/attendance/attendance-config-form";
import { IntegrationsCard } from "@/components/attendance/integrations-card";

export const dynamic = "force-dynamic";

export default function AttendanceConfigPage() {
  return (
    <div className="h-full max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 flex flex-col gap-3 min-h-0">
      <header className="shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] font-medium text-gray-500">
            <span>Settings</span>
            <span className="text-gray-300">›</span>
            <span>HR &amp; Attendance</span>
          </div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-gray-900 leading-tight mt-0.5">
            Attendance Configuration
          </h1>
        </div>
      </header>
      {/* Linked forms first — without these, holiday/leave detection in the
          widget and the same in payroll both stay empty. Stays compact
          (collapsible) so it doesn't eat the form's vertical budget. */}
      <div className="shrink-0">
        <IntegrationsCard />
      </div>
      <AttendanceConfigForm />
    </div>
  );
}
