import { TeamAttendance } from "@/components/attendance/team-attendance";

export const dynamic = "force-dynamic";

export default function TeamAttendancePage() {
  // The component owns the full WorkspaceShell chrome (header + list pane)
  // so the page wrapper is intentionally minimal — mirrors the My Attendance
  // page pattern.
  return <TeamAttendance />;
}
