"use client";

/**
 * Attendance Configuration — settings form for the org's attendance policy
 * (shifts, grace, half/full-day thresholds, geofence, face capture, etc.).
 *
 * Wears the same WorkspaceShell + WorkspaceHeader chrome as My Attendance,
 * My Leave, and Team Attendance so the whole HR surface feels uniform. The
 * underlying form keeps its own Save / Reset footer because the dirty-state
 * logic + tab routing already lives inside it — lifting the buttons up
 * would require threading callbacks through the entire 1300-line form.
 */

import { AttendanceConfigForm } from "@/components/attendance/attendance-config-form";
import { Settings } from "lucide-react";
import {
  WorkspaceShell,
  WorkspaceHeader,
} from "@/components/real-estate/workspace";

export const dynamic = "force-dynamic";

export default function AttendanceConfigPage() {
  return (
    <WorkspaceShell
      scope="attendance-config"
      selectedId={null}
      onCloseSelection={() => {}}
      header={
        <WorkspaceHeader
          icon={<Settings className="h-5 w-5" />}
          title="Attendance Configuration"
          subtitle="Shift, grace, half/full-day thresholds, geofence, face capture, approvals"
        />
      }
      list={
        <div className="h-full overflow-y-auto bg-muted/10">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-5">
            <div className="bg-background border rounded-xl shadow-sm p-3 sm:p-4">
              <AttendanceConfigForm />
            </div>
          </div>
        </div>
      }
      preview={null}
    />
  );
}
